import { time } from '@util';
import type LogWrangler from './logWrangler';
import {
  type IGamemode,
  type ILogMinigame,
  type IMinigameList,
  type IPlayerPositions,
  type IServerStatus,
} from './types';
import {
  type InjectedCommands,
  type OmeggaPlayer,
  type OmeggaLike,
} from '@/plugin';
import Logger from '@/logger';

type Cast<X, Y> = X extends Y ? X : Y;
type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;
type Extract<T, U> = T extends U ? T : never;
// used by the commented-out getAllPawnData experiment below
export type FromEntriesDataField<T> = T extends PawnDataField<infer Key, any>[]
  ? {
      [K in Cast<Key, string>]: ReturnType<
        NonNullable<
          Extract<ArrayElement<T>, PawnDataField<K, any>>['valueTransform']
        >
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
  if (!columns) throw new Error('invalid table header: ' + header);
  return new RegExp(
    columns // get all strings between the |'s'
      .map((line, i): [string, number] => [
        line.slice(1, -1),
        line.length - (i === columns.length - 1 ? 1 : 2),
      ]) // calculate the lengths (and remove the spaces)
      .map(([name, len]) => ` (?<${name.trim().toLowerCase()}>.{${len}})( |$)`) // create a regex pattern to match strings of that length (and trim off whitespace at the end)
      .join('\\|'),
  ); // join the regexes with the |
};
/**
 * CL at which the gamemode/team object model (`BP_GameStateBase_C` +
 * `BRGameModeTeam`) replaced the old `BP_Ruleset_C`/`BP_Team_C` minigame model
 * (same CL the `Server.Minigames.*` console commands were deprecated).
 */
const GAMEMODE_MODEL_CL = 14000;

/** the `Players (online/max):` line that terminates the status header */
const PLAYER_COUNT_REGEX = /^Players \((\d+)\/(\d+)\):/;

/** header keys that carry text or a duration rather than a stat */
const NON_STAT_KEYS = ['Server Name', 'Description', 'Time'];

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

    // The status header is a block of `Key: value` lines terminated by the
    // player table's `Players (n/m):` line. It's read by key rather than by
    // position, so a line the game adds later cannot shift (or invalidate)
    // everything after it, and so new stats are picked up automatically.
    const lines = statusLines.map(l => l[1]);
    const playersIndex = lines.findIndex(l => PLAYER_COUNT_REGEX.test(l));
    const headerLines =
      playersIndex === -1 ? lines : lines.slice(0, playersIndex);

    // keys are hardcoded literals, so there's nothing to escape here
    const findValue = (key: string) => {
      const pattern = new RegExp(`^${key}: ?(.*)$`);
      for (const line of headerLines) {
        const match = line.match(pattern);
        if (match) return match[1];
      }
      return undefined;
    };

    const serverName = findValue('Server Name');
    const uptime = findValue('Time');

    // these two frame the block; without them nothing was parsed
    if (serverName == null || uptime == null) return null;

    // every other integer-valued header line is a stat: bricks and components
    // today, plus whatever the game starts reporting later
    const stats: Record<string, number> = {};
    for (const line of headerLines) {
      const match = line.match(/^([A-Za-z][A-Za-z ]*?): (\d+)$/);
      if (!match || NON_STAT_KEYS.includes(match[1])) continue;
      stats[match[1].toLowerCase().replace(/ +/g, '_')] = Number(match[2]);
    }

    const playerCounts =
      playersIndex === -1
        ? null
        : lines[playersIndex].match(PLAYER_COUNT_REGEX);

    const status = {
      serverName,
      description: findValue('Description') ?? '',
      bricks: stats.bricks ?? 0,
      components: stats.components ?? 0,
      time: time.parseDuration(uptime),
      ...(playerCounts ? { maxPlayers: Number(playerCounts[2]) } : {}),
      stats,
      // extract players using the generated table regex
      players: columnRegExp
        ? tableLines.flatMap(l => {
            // match the player row with the generated regex; skip rows that
            // don't fit the table format
            const groups = l.match(columnRegExp)?.groups;
            if (!groups) return [];
            const { name, ping, time: online, roles, address, id } = groups;
            // trim and parse the matched data
            return [
              {
                name: name.trim(),
                ping: time.parseDuration(ping.trim()),
                time: time.parseDuration(online.trim()),
                roles: roles
                  .trim()
                  .split(', ')
                  .filter(r => r.length > 0), // roles are split by ', '
                address: address.replace('(Owner)', '').trim(),
                id: id.trim(),
              },
            ];
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

    // no header means no minigame table was printed
    if (!tableHeader) return [];

    // use the size of each column to build a regex that matches each row
    const columnRegExp = buildTableHeaderRegex(tableHeader);

    return tableLines.flatMap(l => {
      // match the minigame row with the generated regex; skip rows that
      // don't fit the table format
      const groups = l.match(columnRegExp)?.groups;
      if (!groups) return [];
      const { id, name, ownername, ownerid, member } = groups;
      // trim and parse the matched data
      return [
        {
          index: Number(id),
          name: name.trim(),
          numMembers: Number(member),
          owner: { name: ownername.trim(), id: ownerid },
        },
      ];
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

    // iterate through the pawn+controllers
    // only include entries with a player. previously we filtered by position
    // but this breaks for players without a pawn, instead it's preferable to
    // pass null
    return pawns.flatMap(pawnMatch => {
      const groups = pawnMatch.groups;
      if (!groups) return [];

      // find the player for the associated controller
      const player = this.getPlayer(groups.controller);
      if (!player) return [];

      // find the position for the associated pawn
      const pos = positions.find(pos => groups.pawn === pos.groups?.pawn);
      const isDead = deadFigures.find(
        dead => groups.pawn === dead.groups?.pawn,
      );

      return [
        {
          player,
          pawn: groups.pawn || null,
          // turn the position into a [x, y, z] number array (last 3 items in the array)
          pos: pos ? pos.slice(3).map(Number) : null,
          isDead: isDead ? isDead.groups?.dead === 'True' : true,
        },
      ];
    });
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

      const sortedRulesets = rulesets.sort((a, b) =>
        (b.groups?.ruleset ?? '').localeCompare(a.groups?.ruleset ?? ''),
      );
      const globalIndex = rulesets.findIndex(
        ruleset => ruleset.groups?.name === 'GLOBAL',
      );

      const indexMap: Record<string, number> = Object.fromEntries(
        sortedRulesets.flatMap((ruleset, index) => {
          if (globalIndex > -1) {
            if (index > globalIndex) {
              index = index - 1;
            } else if (index === globalIndex) {
              index = -1;
            }
          }

          const name = ruleset.groups?.ruleset;
          return name ? [[name, index]] : [];
        }),
      );

      // join the data into a big object
      return rulesets.flatMap(r => {
        const groups = r.groups;
        if (!groups) return [];

        return [
          {
            name: groups.name,
            ruleset: groups.ruleset,
            index: indexMap[groups.ruleset],

            // get the players from the team members
            members: (
              ruleMembers.find(m => m.item.ruleset === groups.ruleset)
                ?.members ?? []
            ) // get the members from this ruleset
              .map(m => this.getPlayer(m.state))
              .filter((p): p is OmeggaPlayer => Boolean(p)), // get the players

            // get the teams for this ruleset
            teams: teamMembers
              .filter(m => m.item.ruleset === groups.ruleset) // only get teams from this ruleset
              .map(m => {
                // team color is (B=255,G=255,R=255,A=255)
                const colorGroups = teamColors.find(
                  t => t.groups?.team === m.item.team,
                )?.groups;
                return {
                  // team name
                  name:
                    teamNames.find(t => t.groups?.team === m.item.team)?.groups
                      ?.name ?? '',
                  team: m.item.team,

                  // get the team color as [r, g, b, a]
                  color: colorGroups
                    ? [
                        colorGroups.r,
                        colorGroups.g,
                        colorGroups.b,
                        colorGroups.a,
                      ].map(Number)
                    : [0, 0, 0, 0],

                  // get the players from the team
                  members: m.members
                    .map(m => this.getPlayer(m.state))
                    .filter((p): p is OmeggaPlayer => Boolean(p)),
                };
              }),
          },
        ];
      });
    } catch (e) {
      Logger.error('error getting minigames', e);
      return [];
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
    (obj as unknown as Record<string, (...args: unknown[]) => unknown>)[cmd] = (
      COMMANDS[cmd as keyof typeof COMMANDS] as (...args: unknown[]) => unknown
    ).bind(logWrangler);
  }
};
