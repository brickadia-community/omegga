import _ from 'lodash';
import { color, time } from '@util';
import type LogWrangler from './logWrangler';
import {
  IGamemode,
  ILogMinigame,
  IMinigameList,
  IPlayerPositions,
  IServerStatus,
} from './types';
import { InjectedCommands, OmeggaPlayer, OmeggaLike } from '@/plugin';
import Logger from '@/logger';

type Cast<X, Y> = X extends Y ? X : Y;
type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
type Extract<T, U> = T extends U ? T : never;
type FromEntriesDataField<T> = T extends PawnDataField<infer Key, any>[]
  ? {
      [K in Cast<Key, string>]: ReturnType<
        Extract<ArrayElement<T>, PawnDataField<K, any>>['valueTransform']
      >;
    }
  : { [key in string]: any };

export type PawnDataField<F, T = string> = {
  /**
   * The command to execute and listen to.
   */
  command: string;

  /**
   * The game object name, like `BP_FigureV2_C`.
   */
  object: string;

  /**
   * What object should be matched, like `/(?<pawn>BP_FigureV2_C_\d+)/`.
   */
  objectMatcher: RegExp;

  /**
   * The field on the game object, like `bIsDead`.
   */
  objectField: string;

  /**
   * The regex that should match the value of the game object field.
   * If `valueTransform` is not specified, `value` becomes the first capture group.
   */
  valueMatcher: RegExp;

  /**
   * An optional closure to transform what `valueMatcher` matched.
   */
  valueTransform?: (match: RegExpMatchArray) => T;

  /**
   * The field on the final object.
   */
  field: F;
};

const buildTableHeaderRegex = (header: string) => {
  const columns = header.match(/[^|]+/g);
  return new RegExp(
    columns // get all strings between the |'s'
      .map((line, i) => [
        line.slice(1, -1),
        line.length - (i === columns.length - 1 ? 1 : 2),
      ]) // calculate the lengths (and remove the spaces)
      .map(
        ([name, len]: [string, number]) =>
          ` (?<${name.trim().toLowerCase()}>.{${len}})( |$)`,
      ) // create a regex pattern to match strings of that length (and trim off whitespace at the end)
      .join('\\|'),
  ); // join the regexes with the |
};
/**
 * CL at which the gamemode/team object model (`BP_GameStateBase_C` +
 * `BRGameModeTeam`) replaced the old `BP_Ruleset_C`/`BP_Team_C` minigame model
 * (same CL the `Server.Minigames.*` console commands were deprecated).
 */
const GAMEMODE_MODEL_CL = 14000;

// A list of commands that can be injected to things with the log wrangler
/**
 * List of injected commands
 */
const COMMANDS: InjectedCommands = {
  /**
   * Get a server status object containing bricks, time, players, player ping, player roles, etc
   */
  async getServerStatus(): Promise<IServerStatus | null> {
    const { omegga } = this as unknown as LogWrangler;
    const statusLines = await (
      this as OmeggaLike
    ).watchLogChunk<RegExpMatchArray>(
      omegga.Console.Server.Status,
      /^LogConsoleCommands: (.+)$/,
      {
        first: match => match[1].startsWith('Server Name:'),
        timeoutDelay: 1000,
      },
    );

    // the table lines all start with '* '
    // find all those lines, and remove the asterisk
    const [tableHeader, ...tableLines] = statusLines
      .filter(l => l[1].startsWith('* '))
      .map(l => l[1].slice(1));

    // use the size of each column to build a regex that matches each row
    const columnRegExp = tableHeader
      ? buildTableHeaderRegex(tableHeader)
      : null;

    if (statusLines.length < 5) return null;

    const serverName = statusLines[0][1].match(/^Server Name: (.*)$/);
    const description = statusLines[1][1].match(/^Description: (.*)$/);
    const bricks = statusLines[2][1].match(/^Bricks: (\d+)$/);
    const components = statusLines[3][1].match(/^Components: (\d+)$/);
    const uptime = statusLines[4][1].match(/^Time: (.*)$/);

    if (!serverName || !description || !bricks || !components || !uptime)
      return null;

    const status = {
      serverName: serverName[1],
      description: description[1],
      bricks: Number(bricks[1]),
      components: Number(components[1]),
      time: time.parseDuration(uptime[1]),
      // extract players using the generated table regex
      players: columnRegExp
        ? tableLines.map(l => {
            // match the player row with the generated regex
            const {
              groups: { name, ping, time: online, roles, address, id },
            } = l.match(columnRegExp);
            // trim and parse the matched data
            return {
              name: name.trim(),
              ping: time.parseDuration(ping.trim()),
              time: time.parseDuration(online.trim()),
              roles: roles
                .trim()
                .split(', ')
                .filter(r => r.length > 0), // roles are split by ', '
              address: address.replace('(Owner)', '').trim(),
              id: id.trim(),
            };
          })
        : [],
    };

    return status;
  },

  /**
   * Get a list of minigames
   * @deprecated minigames were replaced by a single gamemode (~CL14000); on
   * modern servers this returns at most one entry with an empty `owner`.
   * Prefer {@link getGamemode}.
   * @return Minigame List
   */
  async listMinigames(): Promise<IMinigameList> {
    const w = this as unknown as LogWrangler;

    // Modern servers (>=CL14000): `Server.Minigames.List` was removed when
    // gamemodes replaced minigames. Derive a single entry from the gamemode;
    // there is no per-minigame `owner` anymore.
    if (w.omegga.version >= GAMEMODE_MODEL_CL) {
      const gamemode = await w.omegga.getGamemode();
      return gamemode
        ? [
            {
              index: 0,
              name: gamemode.name,
              numMembers: gamemode.members.length,
              owner: { name: '', id: '' },
            },
          ]
        : [];
    }

    // Legacy: the `Server.Minigames.List` console command + table parsing.
    const minigameLines = await (
      this as OmeggaLike
    ).watchLogChunk<RegExpMatchArray>(
      w.omegga.Console.Server.Minigames.List,
      /^LogConsoleCommands: (.+)$/,
      {
        first: match => match[1].startsWith('Minigame Count:'),
        timeoutDelay: 1000,
      },
    );

    // the table lines all start with '* '
    // find all those lines, and remove the asterisk
    const [tableHeader, ...tableLines] = minigameLines
      .filter(l => l[1].startsWith('* '))
      .map(l => l[1].slice(1));

    // use the size of each column to build a regex that matches each row
    const columnRegExp = buildTableHeaderRegex(tableHeader);

    return tableLines.map(l => {
      // match the player row with the generated regex
      const {
        groups: { id, name, ownername, ownerid, member },
      } = l.match(columnRegExp);
      // trim and parse the matched data
      return {
        index: Number(id),
        name: name.trim(),
        numMembers: Number(member),
        owner: { name: ownername.trim(), id: ownerid },
      };
    });
  },

  // async getAllPawnData<T extends PawnDataField<string, any>[]>(
  //   fields: T
  // ): Promise<{
  //   controller: string;
  //   data: FromEntriesDataField<[PawnDataField<'pawn', string>, ...T]>;
  // }> {
  //   const restFields: [PawnDataField<'pawn', string>, ...T] = [
  //     {
  //       command: 'GetAll BP_PlayerController_C Pawn',
  //       object: 'BP_PlayerController_C',
  //       objectMatcher: /(?<controller>BP_PlayerController_C_\d+)/,
  //       objectField: 'Pawn',
  //       valueMatcher:
  //         /(?:None|BP_FigureV2_C'.+?:PersistentLevel.(?<pawn>BP_FigureV2_C_\d+)')?$/,
  //       valueTransform: matches => matches.groups.pawn ?? null,
  //       field: 'pawn',
  //     } as PawnDataField<'pawn', string>,
  //     ...fields,
  //   ];

  //   return {
  //     controller: 'test',
  //     data: Object.fromEntries(
  //       restFields.map(f => [
  //         f.field,
  //         f.valueTransform({ groups: { pawn: 'foo' } } as any),
  //       ])
  //     ) as FromEntriesDataField<[PawnDataField<'pawn', string>, ...T]>,
  //   };
  // },

  /**
   * get every player's position and alive states
   */
  async getAllPlayerPositions(): Promise<IPlayerPositions> {
    const pawnRegExp =
      /(?<index>\d+)\) BP_PlayerController_C .+?PersistentLevel\.(?<controller>BP_PlayerController_C_\d+)\.Pawn = .*?(?:None|BP_FigureV2_C'.+?:PersistentLevel.(?<pawn>BP_FigureV2_C_\d+)')?$/;
    const posRegExp =
      /(?<index>\d+)\) CapsuleComponent .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.CollisionCylinder\.RelativeLocation = \(X=(?<x>[\d.-]+),Y=(?<y>[\d.-]+),Z=(?<z>[\d.-]+)\)$/;
    const deadFigureRegExp =
      /(?<index>\d+)\) BP_FigureV2_C .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.bIsDead = (?<dead>(True|False))$/;

    // wait for the pawn and position watchers to return all the results
    const [pawns, deadFigures, positions] = await Promise.all([
      this.watchLogChunk<RegExpMatchArray>(
        'GetAll BP_PlayerController_C Pawn',
        pawnRegExp,
        {
          first: 'index',
          timeoutDelay: 250,
        },
      ),
      this.watchLogChunk<RegExpMatchArray>(
        'GetAll BP_FigureV2_C bIsDead',
        deadFigureRegExp,
        {
          first: 'index',
          timeoutDelay: 250,
        },
      ),
      this.watchLogChunk<RegExpMatchArray>(
        'GetAll SceneComponent RelativeLocation Name=CollisionCylinder',
        posRegExp,
        { first: 'index', timeoutDelay: 250 },
      ),
    ]);

    return (
      pawns
        // iterate through the pawn+controllers
        .map(pawn => ({
          // find the player for the associated controller
          player: this.getPlayer(pawn.groups.controller),
          // find the position for the associated pawn
          pos: positions.find(pos => pawn.groups.pawn === pos.groups.pawn),
          isDead: deadFigures.find(
            dead => pawn.groups.pawn === dead.groups.pawn,
          ),
          pawn,
        }))
        // filter by only those who have both player. previously we filtered by position but this breaks for players without a pawn, instead it's preferable to pass null
        .filter(p => p.player)
        // turn the position into a [x, y, z] number array (last 3 items in the array)
        .map(p => ({
          player: p.player,
          pawn: p.pawn.groups.pawn || null,
          pos: p.pos ? p.pos.slice(3).map(Number) : null,
          isDead: p.isDead ? p.isDead.groups.dead === 'True' : true,
        }))
    );
  },

  /**
   * get all minigames and their players (and the player's teams).
   *
   * On servers older than CL14000 this returns one entry per `BP_Ruleset_C`
   * minigame. On modern servers minigames were replaced by a single gamemode,
   * so this returns a single-element array (the gamemode and its teams) for
   * backwards compatibility - prefer {@link getGamemode}.
   */
  async getMinigames(): Promise<ILogMinigame[]> {
    const w = this as unknown as LogWrangler;

    // modern servers (>=CL14000) have a single gamemode in place of minigames
    if (w.omegga.version >= GAMEMODE_MODEL_CL) {
      const gamemode = await w.omegga.getGamemode();
      return gamemode
        ? [
            {
              name: gamemode.name,
              ruleset: gamemode.gamestate,
              index: 0,
              members: gamemode.members,
              teams: gamemode.teams,
            },
          ]
        : [];
    }

    // legacy (<CL14000): one entry per BP_Ruleset_C minigame
    const ruleNameRegExp =
      /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.RulesetName = (?<name>.*)$/;
    const ruleMembersRegExp =
      /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.MemberStates =$/;
    const teamNameRegExp =
      /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.TeamName = (?<name>.*)$/;
    const teamColorRegExp =
      /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.TeamColor = \(B=(?<b>\d+),G=(?<g>\d+),R=(?<r>\d+),A=(?<a>\d+)\)$/;
    const teamMembersRegExp =
      /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.MemberStates =$/;
    const playerStateRegExp =
      /^\t(?<index>\d+): .*?BP_PlayerState_C'(.+):PersistentLevel\.(?<state>BP_PlayerState_C_\d+)'$/;

    try {
      // parse console output to get the minigame info
      const [rulesets, ruleMembers, teamMembers, teamNames, teamColors] =
        await Promise.all([
          this.watchLogChunk<RegExpMatchArray>(
            'GetAll BP_Ruleset_C RulesetName',
            ruleNameRegExp,
            { first: 'index' },
          ),
          this.watchLogArray<
            { index: string; ruleset: string },
            { index: string; state: string }
          >(
            'GetAll BP_Ruleset_C MemberStates',
            ruleMembersRegExp,
            playerStateRegExp,
          ),
          this.watchLogArray<
            { index: string; ruleset: string; team: string },
            { index: string; state: string }
          >(
            'GetAll BP_Team_C MemberStates',
            teamMembersRegExp,
            playerStateRegExp,
          ),
          this.watchLogChunk<RegExpMatchArray>(
            'GetAll BP_Team_C TeamName',
            teamNameRegExp,
            { first: 'index' },
          ),
          // team color in a5 is based on (B=255,G=255,R=255,A=255)
          this.watchLogChunk<RegExpMatchArray>(
            'GetAll BP_Team_C TeamColor',
            teamColorRegExp,
            { first: 'index' },
          ),
        ]);

      // figure out what to do with the matched color results
      const handleColor = (
        match:
          | { color: string }
          | { r: string; g: string; b: string; a: string },
      ) => {
        // color index, return the colorset color
        if ('color' in match)
          return color.DEFAULT_COLORSET[Number(match)].slice();
        else return [match.r, match.g, match.b, match.a].map(Number);
      };

      const sortedRulesets = rulesets.sort((a, b) =>
        b.groups?.ruleset.localeCompare(a.groups?.ruleset),
      );
      const globalIndex = rulesets.findIndex(
        ruleset => ruleset.groups?.name === 'GLOBAL',
      );

      const indexMap = Object.fromEntries(
        sortedRulesets.map((ruleset, index) => {
          if (globalIndex > -1) {
            if (index > globalIndex) {
              index = index - 1;
            } else if (index === globalIndex) {
              index = -1;
            }
          }

          return [ruleset.groups?.ruleset, index];
        }),
      );

      // join the data into a big object
      return rulesets.map(r => ({
        name: r.groups.name,
        ruleset: r.groups.ruleset,
        index: indexMap[r.groups.ruleset],

        // get the players from the team members
        members: ruleMembers
          .find(m => m.item.ruleset === r.groups.ruleset)
          .members // get the members from this ruleset
          .map(m => this.getPlayer(m.state))
          .filter(Boolean), // get the players

        // get the teams for this ruleset
        teams: teamMembers
          .filter(m => m.item.ruleset === r.groups.ruleset) // only get teams from this ruleset
          .map(m => ({
            // team name
            name: _.get(
              teamNames.find(t => t.groups.team === m.item.team),
              'groups.name',
            ) as string,
            team: m.item.team,

            // get the colors (different for a4 and a5)
            color: handleColor(
              _.pick(
                teamColors.find(t => t.groups.team === m.item.team)?.groups ??
                  ({ r: 0, g: 0, b: 0, a: 0 } as any),
                ['r', 'g', 'b', 'a'],
              ),
            ),

            // get the players from the team
            members: m.members
              .map(m => this.getPlayer(m.state))
              .filter(Boolean),
          })),
      }));
    } catch (e) {
      Logger.error('error getting minigames', e);
      return undefined;
    }
  },

  /**
   * get the single gamemode and its teams/players (modern servers, >=CL14000).
   * Returns null on older servers (which instead have multiple minigames -
   * use {@link getMinigames}).
   */
  async getGamemode(): Promise<IGamemode | null> {
    const w = this as unknown as LogWrangler;
    // the single-gamemode model only exists on modern servers
    if (w.omegga.version < GAMEMODE_MODEL_CL) return null;

    // patterns to match the console logs
    const gameModeNameRegExp =
      /^(?<index>\d+)\) BP_GameStateBase_C (.+):PersistentLevel\.(?<gamestate>BP_GameStateBase_C_\d+)\.GameModeName = (?<name>.*)$/;
    const teamNameRegExp =
      /^(?<index>\d+)\) BRGameModeTeam (.+):PersistentLevel\.(?<team>BRGameModeTeam_\d+)\.TeamName = (?<name>.*)$/;
    const teamColorRegExp =
      /^(?<index>\d+)\) BRGameModeTeam (.+):PersistentLevel\.(?<team>BRGameModeTeam_\d+)\.TeamColor = \(B=(?<b>\d+),G=(?<g>\d+),R=(?<r>\d+),A=(?<a>\d+)\)$/;
    const teamMembersRegExp =
      /^(?<index>\d+)\) BRGameModeTeam (.+):PersistentLevel\.(?<team>BRGameModeTeam_\d+)\.MemberStates =$/;
    const playerStateRegExp =
      /^\t(?<index>\d+): .*?BP_PlayerState_C'(.+):PersistentLevel\.(?<state>BP_PlayerState_C_\d+)'$/;

    try {
      // parse console output to get the gamemode and team info
      const [gamemodes, teamNames, teamColors, teamMembers] = await Promise.all(
        [
          this.watchLogChunk<RegExpMatchArray>(
            'GetAll BP_GameStateBase_C GameModeName',
            gameModeNameRegExp,
            { first: 'index', timeoutDelay: 250 },
          ),
          this.watchLogChunk<RegExpMatchArray>(
            'GetAll BRGameModeTeam TeamName',
            teamNameRegExp,
            { first: 'index', timeoutDelay: 250 },
          ),
          // team color is (B=255,G=255,R=255,A=255)
          this.watchLogChunk<RegExpMatchArray>(
            'GetAll BRGameModeTeam TeamColor',
            teamColorRegExp,
            { first: 'index', timeoutDelay: 250 },
          ),
          this.watchLogArray<
            { index: string; team: string },
            { index: string; state: string }
          >(
            'GetAll BRGameModeTeam MemberStates',
            teamMembersRegExp,
            playerStateRegExp,
          ),
        ],
      );

      // there is a single gamemode (one BP_GameStateBase_C)
      const gamemode = gamemodes[0]?.groups;
      if (!gamemode) return null;

      // build the teams from the name/color/member lookups
      const teams = teamNames.map(t => {
        const groups = t.groups!;
        const id = groups.team;
        const colorGroups = teamColors.find(c => c.groups?.team === id)?.groups;
        return {
          name: groups.name,
          team: id,
          // [r, g, b, a]
          color: colorGroups
            ? [colorGroups.r, colorGroups.g, colorGroups.b, colorGroups.a].map(
                Number,
              )
            : [0, 0, 0, 0],
          // resolve the players on this team from their player states
          members: (teamMembers.find(m => m.item.team === id)?.members ?? [])
            .map(m => this.getPlayer(m.state))
            .filter((p): p is OmeggaPlayer => Boolean(p)),
        };
      });

      return {
        name: gamemode.name,
        gamestate: gamemode.gamestate,
        // the gamemode's members are every player across all teams
        members: teams.flatMap(t => t.members),
        teams,
      };
    } catch (e) {
      Logger.error('error getting gamemode', e);
      return null;
    }
  },
};

// inject the commands into the object given a log wrangler
export default <T extends InjectedCommands>(
  obj: T,
  logWrangler: LogWrangler,
) => {
  for (const cmd in COMMANDS) {
    // disgusting type casting because we're injecting functions
    (obj as unknown as Record<string, Function>)[cmd] =
      COMMANDS[cmd as keyof typeof COMMANDS].bind(logWrangler);
  }
};
