const { color, time } = require('../util/index.js');
const _ = require('lodash');

// A list of commands that can be injected to things with the log wrangler
const COMMANDS = {

  // Get a server status object containing bricks, time, players, player ping, player roles, etc
  async getServerStatus() {
    const statusLines = await this.watchLogChunk(
      'Server.Status',
      /^LogConsoleCommands: (.+)$/,
      {first: match => match[1].startsWith('Server Name:'), timeoutDelay: 1000}
    );

    // the table lines all start with '* '
    // find all those lines, and remove the asterisk
    const [tableHeader, ...tableLines] = statusLines.filter(l => l[1].startsWith('* ')).map(l => l[1].slice(1));

    // use the size of each column to build a regex that matches each row
    const columnRegExp = new RegExp(tableHeader
      .match(/[^|]+/g) // get all strings between the |'s'
      .map((line, i) => [line.slice(1, -1), line.length - (i === 5 ? 1 : 2)]) // calculate the lengths (and remove the spaces)
      .map(([name, len]) => ` (?<${name.trim().toLowerCase()}>.{${len}})( |$)`) // create a regex pattern to match strings of that length (and trim off whitespace at the end)
      .join('\\|')); // join the regexes with the |

    const status = {
      // easily extract certain values from the server status
      serverName: statusLines[0][1].match(/^Server Name: (.*)$/)[1],
      description: statusLines[1][1].match(/^Description: (.*)$/)[1],
      bricks: Number(statusLines[2][1].match(/^Bricks: (\d+)$/)[1]),
      components: Number(statusLines[3][1].match(/^Components: (\d+)$/)[1]),
      time: time.parseDuration(statusLines[4][1].match(/^Time: (.*)$/)[1]),
      // extract players using the generated table regex
      players: tableLines.map(l => {
        // match the player row with the generated regex
        const { groups: { name, ping, time: online, roles, address, id }} = l.match(columnRegExp);
        // trim and parse the matched data
        return {
          name: name.trim(),
          ping: time.parseDuration(ping.trim()),
          time: time.parseDuration(online.trim()),
          roles: roles.trim().split(', ').filter(r => r.length > 0), // roles are split by ', '
          address: address.replace('(Owner)', '').trim(),
          id: id.trim(),
        };
      }),
    };

    return status;
  },

  // get every player's position
  async getAllPlayerPositions() {
    const pawnRegExp = /(?<index>\d+)\) BP_PlayerController_C .+?PersistentLevel\.(?<controller>BP_PlayerController_C_\d+)\.Pawn = BP_FigureV2_C'.+?:PersistentLevel.(?<pawn>BP_FigureV2_C_\d+)'$/;
    const posRegExp = /(?<index>\d+)\) CapsuleComponent .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.CollisionCylinder\.RelativeLocation = \(X=(?<x>[\d.-]+),Y=(?<y>[\d.-]+),Z=(?<z>[\d.-]+)\)$/;
    const deadFigureRegExp = /(?<index>\d+)\) BP_FigureV2_C .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.bIsDead = (?<dead>(True|False))$/;

    // wait for the pawn and position watchers to return all the results
    const [ pawns, deadFigures, positions ] = await Promise.all([
      this.watchLogChunk('GetAll BP_PlayerController_C Pawn', pawnRegExp, {first: 'index'}),
      this.watchLogChunk('GetAll BP_FigureV2_C bIsDead', deadFigureRegExp, {first: 'index'}),
      this.watchLogChunk('GetAll SceneComponent RelativeLocation Name=CollisionCylinder', posRegExp, {first: 'index'}),
    ]);

    return pawns
      // iterate through the pawn+controllers
      .map(pawn => ({
      // find the player for the associated controller
        player: this.getPlayer(pawn.groups.controller),
        // find the position for the associated pawn
        pos: positions.find(pos => pawn.groups.pawn === pos.groups.pawn),
        isDead: deadFigures.find(dead => pawn.groups.pawn === dead.groups.pawn),
        pawn,
      }))
      // filter by only those who have both player and position
      .filter(p => p.player && p.pos)
      // turn the position into a [x, y, z] number array (last 3 items in the array)
      .map(p => ({
        player: p.player,
        pawn: p.pawn.groups.pawn,
        pos: p.pos.slice(3).map(Number),
        isDead: p.isDead && p.isDead.groups.dead === 'True',
      }));
  },

  // get all minigames and their players (and the player's teams)
  async getMinigames() {
    // patterns to match the console logs
    const ruleNameRegExp = /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.RulesetName = (?<name>.*)$/;
    const ruleMembersRegExp = /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.MemberStates =$/;
    const teamNameRegExp = /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.TeamName = (?<name>.*)$/;
    const teamColorRegExp = /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.TeamColor = \(B=(?<b>\d+),G=(?<g>\d+),R=(?<r>\d+),A=(?<a>\d+)\)$/;
    const teamMembersRegExp = /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.MemberStates =$/;
    const playerStateRegExp = /^\t(?<index>\d+): BP_PlayerState_C'(.+):PersistentLevel\.(?<state>BP_PlayerState_C_\d+)'$/;

    try {
      // parse console output to get the minigame info
      const [rulesets, ruleMembers, teamMembers, teamNames, teamColors] = await Promise.all([
        this.watchLogChunk('GetAll BP_Ruleset_C RulesetName', ruleNameRegExp, {first: 'index'}),
        this.watchLogArray('GetAll BP_Ruleset_C MemberStates', ruleMembersRegExp, playerStateRegExp),
        this.watchLogArray('GetAll BP_Team_C MemberStates', teamMembersRegExp, playerStateRegExp),
        this.watchLogChunk('GetAll BP_Team_C TeamName', teamNameRegExp, {first: 'index'}),
        // team color in a5 is based on (B=255,G=255,R=255,A=255)
        this.watchLogChunk('GetAll BP_Team_C TeamColor', teamColorRegExp, {first: 'index'}),
      ]);

      // figure out what to do with the matched color results
      const handleColor = match => {
        // color index, return the colorset color
        if (match.color)
          return color.DEFAULT_COLORSET[Number(match)].slice();
        else
          return [match.r, match.g, match.b, match.a].map(Number);
      };

      // join the data into a big object
      return rulesets.map(r => ({
        name: r.groups.name,
        ruleset: r.groups.ruleset,

        // get the players from the team members
        members: (ruleMembers
          .find(m => m.item.ruleset === r.groups.ruleset)).members // get the members from this ruleset
          .map(m => this.getPlayer(m.state)), // get the players

        // get the teams for this ruleset
        teams: teamMembers
          .filter(m => m.item.ruleset === r.groups.ruleset) // only get teams from this ruleset
          .map(m => ({
            // team name
            name: _.get(teamNames.find(t => t.groups.team === m.item.team), 'groups.name'),
            team: m.item.team,

            // get the colors (different for a4 and a5)
            color: handleColor(_.pick(teamColors.find(t => t.groups.team === m.item.team).groups,
              ['r', 'g', 'b', 'a'])),

            // get the players from the team
            members: m.members.map(m => this.getPlayer(m.state)),
          }))
      }));
    } catch (e) {
      Omegga.error('error getting minigames', e);
      return undefined;
    }
  },
};

// inject the commands into the object given a log wrangler
module.exports = (obj, logWrangler) => {
  for (const cmd in COMMANDS) {
    obj[cmd] = COMMANDS[cmd].bind(logWrangler);
  }
};
