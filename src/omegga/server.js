const fs = require('fs');
const path = require('path');
const glob = require('glob');
const brs = require('brs-js');
const _ = require('lodash');

const OmeggaWrapper = require('./wrapper.js');
const { PluginLoader } = require('./plugin.js');
const { Webserver } = require('../webserver/index.js');
const Database = require('../database/index.js');
const soft = require('../softconfig.js');
const { uuid, pattern, time, file, color } = require('../util/index.js');
const Terminal = require('../cli/terminal.js');

const MATCHERS = [
  require('./matchers/join.js'), // 'join' event => { name, id, state, controller }
  require('./matchers/leave.js'), // 'leave' event => { name, id, state, controller }
  require('./matchers/chat.js'), // 'chat' event => name, message; 'chatcmd:command' event => name, [...args]
  require('./matchers/command.js'), // 'cmd:command' event => name, args (string)
  require('./matchers/auth.js'), // assigns host, 'start' event, 'unauthorized' event
  require('./matchers/exit.js'), // 'exit' event
  require('./matchers/version.js'), // check game version
];

// TODO: safe broadcast parsing

class Omegga extends OmeggaWrapper {
  // pluginloader is not private so plugins can potentially add more formats
  pluginLoader = undefined;

  // prevent omegga from saving over the same file
  #tempSaveCounter = 0;

  // allow a terminal to be used instead of console log
  static terminal = undefined;
  static log(...args) { (Omegga.terminal || console).log(...args); }
  static error(...args) { (Omegga.terminal || console).error(...args); }
  static setTerminal(term) {
    if (term instanceof Terminal)
      Omegga.terminal = term;
  };

  constructor(serverPath, cfg, options={}) {
    super(serverPath, cfg);

    // launch options (disabling webserver)
    this.options = options;

    // path to save files
    this.savePath = path.join(serverPath, soft.DATA_PATH, 'Saved/Builds');

    // path to config files
    this.configPath = path.join(serverPath, soft.DATA_PATH, 'Saved/Server');

    // create dir folders
    file.mkdir(this.savePath);
    file.mkdir(this.configPath);

    // ignore auth file copy
    if (!options.noauth)
      this.copyAuthFiles();

    // the database provides omegga with metrics, chat logs, and more
    // to help administrators keep track of their users and server
    if (!options.nodb)
      this.database = new Database(options, this);

    // create the webserver if it's enabled
    // the webserver lets non-js plugins talk to omegga
    // as well as gives the administrator access to server information while the server is running
    if (!options.noserver)
      this.webserver = new Webserver(options, this.database, this);

    if (!options.noplugin) {
      // create the pluginloader
      this.pluginLoader = new PluginLoader(path.join(serverPath, soft.PLUGIN_PATH), this);

      // load all the plugin formats in
      this.pluginLoader.loadFormats(path.join(__dirname, 'plugin'));

      // scan all available plugins
      this.pluginLoader.scan();
    }

    // list of online players
    this.players = [];

    // host player info
    this.host = undefined;

    // game version (defaults to a4, updates in a matcher)
    this.version = 'a4';

    // server has started
    this.started = false;
    this.starting = false;

    // add all the matchers to the server
    for (const matcher of MATCHERS) {
      const {pattern, callback} = matcher(this);
      this.addMatcher(pattern, callback);
    }

    process.on('uncaughtException', err => {
      this.emit('error', err);
      try { this.stop(); } catch (e) { Omegga.error(e); }
      process.exit();
    });

    this.on('start', () => this.started = true);
    this.on('exit', () => this.stop());
  }

  // start load plugins and start the server
  async start() {
    this.starting = true;
    if (this.webserver) await this.webserver.start();
    if (this.pluginLoader)
      this.pluginLoader.reload();
    super.start();
    this.emit('server:starting');
  }

  // unload load plugins and stop the server
  stop() {
    if (this.pluginLoader)
      this.pluginLoader.unload();
    super.stop();
    if (this.webserver) this.webserver.stop();
    this.emit('server:stopped');
    this.started = false;
    this.starting = false;
  }

  // if auth files exist, copy them
  copyAuthFiles() {
    const authPath = path.join(this.path, soft.DATA_PATH, 'Saved/Auth');
    const homeAuthPath = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

    file.copyFiles(homeAuthPath, authPath, soft.BRICKADIA_AUTH_FILES);
  }

  // broadcast messages to chat
  // messages are broken by new line
  // multiple arguments are additional lines
  broadcast(...messages) {
    messages
      .flatMap(m => m.split('\n'))
      .forEach(m => this.writeln(`Chat.Broadcast ${m}`));
  }

  // broadcast messages to a player
  // messages are broken by new line
  // multiple arguments are additional lines
  whisper(target, ...messages) {
    // find the target player
    if (typeof target !== 'object')
      target = this.getPlayer(target);

    // whisper the messages to that player
    messages
      .flatMap(m => m.split('\n'))
      .forEach(m => this.writeln(`Chat.Whisper ${target.name} ${m}`));
  }

  // get a list of players
  getPlayers() { return this.players.map(p => ({...p})); }

  // read the server json files (the values automatically update when the files change)
  getRoleSetup() { return file.readWatchedJSON(path.join(this.configPath, 'RoleSetup.json')); }
  getRoleAssignments() { return file.readWatchedJSON(path.join(this.configPath, 'RoleAssignments.json')); }
  getBanList() { return file.readWatchedJSON(path.join(this.configPath, 'BanList.json')); }
  getNameCache() { return file.readWatchedJSON(path.join(this.configPath, 'PlayerNameCache.json')); }

  // Get a server status object containing bricks, time, players, player ping, player roles, etc
  async getServerStatus() {
    const statusLines = await this.watchLogChunk(
      'Server.Status',
      /^LogConsoleCommands: (.+)$/,
      {first: match => match[1].startsWith('Server Name:')}
    );

    // the table lines all start with '* '
    // find all those lines, and remove the asterisk
    const [tableHeader, ...tableLines] = statusLines.filter(l => l[1].startsWith('* ')).map(l => l[1].slice(1));

    // use the size of each column to build a regex that matches each row
    const columnRegExp = new RegExp(tableHeader
      .match(/[^|]+/g) // get all strings between the |'s'
      .map((line, i) => [line.slice(1, -1), line.length - (i === 5 ? 1 : 2)]) // calculate the lengths (and remove the spaces)
      .map(([name, len]) => ` (?<${name.trim().toLowerCase()}>.{${len}})( |$)`) // create a regex pattern to match strings of that length (and trim off whitespace at the end)
      .join('\\|')) // join the regexes with the |

    const status = {
      // easily extract certain values from the server status
      serverName: statusLines[0][1].match(/^Server Name: (.*)$/)[1],
      description: statusLines[1][1].match(/^Description: (.*)$/)[1],
      bricks: Number(statusLines[2][1].match(/^Bricks: (\d+)$/)[1]),
      time: time.parseDuration(statusLines[3][1].match(/^Time: (.*)$/)[1]),
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
  }

  // get every player's position
  async getAllPlayerPositions() {
    const pawnRegExp = /(?<index>\d+)\) BP_PlayerController_C .+?PersistentLevel\.(?<controller>BP_PlayerController_C_\d+)\.Pawn = BP_FigureV2_C'.+?:PersistentLevel.(?<pawn>BP_FigureV2_C_\d+)'$/;
    const posRegExp = /(?<index>\d+)\) CapsuleComponent .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.CollisionCylinder\.RelativeLocation = \(X=(?<x>[\d\.-]+),Y=(?<y>[\d\.-]+),Z=(?<z>[\d\.-]+)\)$/;
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
  }

  // find a player by name, id, controller, or state
  getPlayer(arg) {
    return this.players.find(p => p.name === arg || p.id === arg || p.controller === arg || p.state === arg);
  }

  // find a player by rough name, prioritize exact matches and get fuzzier
  findPlayerByName(name) {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return this.players.find(p => p.name === name) // find by exact match
      || this.players.find(p => p.name.indexOf(name) > -1) // find by rough match
      || this.players.find(p => p.name.match(exploded)); // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
  }

  // get the host
  getHostId() { return this.host.id; }

  // get all minigames and their players (and the player's teams)
  async getMinigames() {
    // patterns to match the console logs
    const ruleNameRegExp = /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.RulesetName = (?<name>.*)$/;
    const ruleMembersRegExp = /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.MemberStates =$/;
    const teamNameRegExp = /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.TeamName = (?<name>.*)$/;
    const teamColorIdRegExp = /^(?<index>\d+)\) BP_Team(_\w+)?_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.(?<team>BP_Team(_\w+)?_C_\d+)\.TeamColorId = (?<color>\d+)$/;
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
        {
          // team color in a4 is based on colorset id
          a4: () => this.watchLogChunk('GetAll BP_Team_C TeamColorId', teamColorIdRegExp, {first: 'index'}),
          // team color in a5 is based on (B=255,G=255,R=255,A=255)
          a5: () => this.watchLogChunk('GetAll BP_Team_C TeamColor', teamColorRegExp, {first: 'index'}),
        }[this.version](),
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
            color: handleColor(_.pick(teamColors.find(t => t.groups.team === m.item.team).groups, {
              a4: ['color'],
              a5: ['r', 'g', 'b', 'a'],
            }[this.version])),

            // get the players from the team
            members: m.members.map(m => this.getPlayer(m.state)),
          }))
      }));
    } catch (e) {
      Omegga.error('error getting minigames', e);
      return undefined;
    }
  }

  // clear a user's bricks (by uuid, name, controller, or player object)
  // A5+ Only
  clearBricks(target, quiet=false) {
    // target is a player object, just use that id
    if (typeof target === 'object' && target.id)
      target = target.id;

    // if the target isn't a uuid already, find the player by name or controller and use that uuid
    else  if (typeof target === 'string' && !uuid.match(target)) {
      // only set the target if the player exists
      const player = this.getPlayer(target);
      target = player && player.id;
    }

    if (!target)
      return;

    this.writeln(`Bricks.Clear ${target} ${quiet ? 1 : ''}`)
  }

  // save bricks
  clearAllBricks() { this.writeln('Bricks.ClearAll'); }

  // save bricks
  saveBricks(name) { this.writeln(`Bricks.Save ${name}`); }

  // load bricks
  loadBricks(name, {offX=0, offY=0, offZ=0, quiet=false}={}) { this.writeln(`Bricks.Load ${name} ${offX} ${offY} ${offZ} ${quiet ? 1 : ''}`); }

  // get all saves in the save folder
  getSaves() { return fs.existsSync(this.savePath) ? glob.sync(this.savePath + '/**/*.brs') : []; }

  // returns the path to a save given a save name
  getSavePath(name) {
    const file = path.join(this.savePath, name.endsWith('.brs') ? name : name + '.brs');
    return fs.existsSync(file) ? file : undefined;
  }

  // unsafely load save data (use try/catch)
  writeSaveData(name, data) {
    if (typeof name !== 'string')
      throw 'expected name argument for writeSaveData';

    const file = path.join(this.savePath, name + '.brs');
    fs.writeFileSync(file, new Uint8Array(brs.write(data)));
  }

  // unsafely read save data (use try/catch)
  readSaveData(name) {
    if (typeof name !== 'string')
      throw 'expected name argument for readSaveData';

    const file = this.getSavePath(name);
    if (file) return brs.read(fs.readFileSync(file));
  }

  // load bricks from save data
  // A5+ only
  async loadSaveData(data, {offX=0, offY=0, offZ=0, quiet=false}={}) {
    const saveFile = 'omegga_temp_' + Date.now() + '_' + (this.#tempSaveCounter++);
    // write savedata to file
    this.writeSaveData(saveFile, data);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.Load ${saveFile} ${offX} ${offY} ${offZ} ${quiet ? 1 : ''}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '...'),
        last: match => match[1].match(/Read \d+ bricks/),
      }
    );

    // delete the save file after we're done
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      fs.unlinkSync(savePath);
    }
  }

  // get current bricks as save data
  // A5+ only
  async getSaveData() {
    const saveFile = 'omegga_temp_' + Date.now() + '_' + (this.#tempSaveCounter++);

    // wait for the server to save the file
    await this.watchLogChunk(
      `Bricks.Save ${saveFile}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '...'),
        last: match => match[1].match(/Saved \d+ bricks/),
      },
    );

    // read the save file
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      // read and parse the save file
      const saveData = brs.read(fs.readFileSync(savePath));

      // delete the save file after we're done reading it
      fs.unlinkSync(savePath);

      // return the parsed save
      return saveData;
    }

    return undefined;
  }
}

global.Omegga = Omegga;
module.exports = Omegga;
