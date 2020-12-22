const path = require('path');

const Datastore = require('nedb-promise');
const bcrypt = require('bcrypt');
const chokidar = require('chokidar');

const soft = require('../../softconfig.js');
const {pattern: {explode}, time: {parseBrickadiaTime}} = require('../../util/index.js');

const Calendar = require('./calendar.js');

// TODO: online users graph
// TODO: player online times
// TODO: bricks over time graph
// TODO: minute server status for metrics
// TODO: chat messages per min/hour/day check

let serverInstance;

// generate a punchcard (days x week)
const createPunchcard = () => Array.from({length: 7}).map(() => Array.from({length: 24}).fill(0));

// the database keeps track of metrics for omegga
class Database {
  constructor(options, omegga) {
    this.options = options;
    this.omegga = omegga;
    this.calendar = new Calendar();

    // database
    const dbOpts = {
      autoload: true,
      // case insensitive string comparison
      compareStrings: (a, b) =>
        a.localeCompare(b, 'en', {ignorePunctuation: true}),
    };


    // create all the stores
    this.stores = {
      users: new Datastore({filename: path.join(omegga.dataPath, soft.USER_STORE), ...dbOpts}),
      chat: new Datastore({filename: path.join(omegga.dataPath, soft.CHAT_STORE), ...dbOpts}),
      players: new Datastore({filename: path.join(omegga.dataPath, soft.PLAYER_STORE), ...dbOpts}),
      status: new Datastore({filename: path.join(omegga.dataPath, soft.STATUS_STORE), ...dbOpts}),
      server: new Datastore({filename: path.join(omegga.dataPath, soft.SERVER_STORE), ...dbOpts}),
    };
  }

  // make sure all the databases have valid store versions
  async doMigrations() {
    // current store versions
    const storeVersions = {
      users: 1,
      chat: 1,
      players: 1,
      status: 1,
      server: 1,

      // example version
      dummy: 10,
    };

    // migrations to/from certain store versions
    const migrations = {
      users: [],
      chat: [],
      players: [],
      status: [],
      server: [],

      // example migration list (all version upgrades go up by 1)
      dummy: [{
        version: 1, // target version
        upgrade: async _store => {}, // upgrade function (does not include updating version)
      }],
    };

    // loop through all stores to find if any need version upgrades
    await Promise.all(Object.entries(this.stores).map(async ([name, store]) => {
      const versionEntry = await store.findOne({type: 'storeVersion'});
      const expected = storeVersions[name];
      // if the version was not found, insert it
      if (!versionEntry) {
        store.insert({type: 'storeVersion', version: expected});

      // if the version was not what was expected
      } else if (expected !== versionEntry.version) {

        // while the version is below the expected version
        let { version } = versionEntry;
        for (; version < expected; version++) {
          // find an available migration
          const migration = migrations[name].find(v => v.version === version);

          // no migration found, ignore
          if (!migration) break;

          // run the upgrade
          migration.upgrade(store);
        }

        // update the stored version
        await store.update({ _id: versionEntry._id }, { version });
      }
    }));
  }


  // get the running instance id of this omegga
  async getInstanceId() {
    if (serverInstance) return serverInstance._id;

    const doc = await this.stores.server.insert({
      type: 'app:start',
      date: Date.now(),
    });

    serverInstance = doc;

    // create a calendar of all previous chat messages
    const dates = (await this.stores.chat.find({type: 'chat'}))
      .map(c => c.created);
    for (const d of dates) {
      this.calendar.addDate(d);
    }

    const watcher = chokidar.watch(path.join(this.omegga.configPath, 'BanList.json'), {persistent: false});
    watcher
      .on('add', () => setTimeout(this.syncBanList.bind(this), 1000))
      .on('change', () => setTimeout(this.syncBanList.bind(this), 1000));
    setTimeout(this.syncBanList.bind(this), 1000);

    const handleKick = (kicked, kicker, reason) => {
      // time the event listener should expire
      const eventExpire = Date.now() + 100;

      // detect a single leave
      this.omegga.once('leave',async leavingPlayer => {
        const now = Date.now();
        // if a player leaves more than 100ms from the kick command, it's bugged
        if (now > eventExpire) return;

        if (leavingPlayer.id === kicked.id) {
          const entry = {
            type: 'kickHistory',
            kicked: kicked.id,
            kickerId: kicker.id,
            created: now,
            reason,
          };

          // depending on implementation, this could potentially be a kick event
          await this.stores.players.update(entry, {$set: entry}, {upsert: true});
        }
      });
    };

    // game version is not known at init so we have to check version at command time
    // alternatively,
    // kick history detection for a4 is based on the chat command
    this.omegga.on('cmd:kick', (name, ...args) => {
      if (this.omegga.version !== 'a4') return;

      const target = args.join(' ');
      const reason = 'no reason given';

      // find the player doing the kicking
      const kickerPlayer = this.omegga.getPlayer(name);

      // kicker does not exist
      if (!kickerPlayer) return;

      // player is not capable of kicking
      if (!kickerPlayer.getPermissions()['Players.Kick']) return;

      // find the kicked player
      const kickedPlayer = this.omegga.findPlayerByName(target);
      if (!kickedPlayer) return;

      handleKick(kickedPlayer, kickerPlayer, reason);
    });

    // for a5 is based on the chat event
    this.omegga.on('kick', (kicked, kicker, reason) => {
      if (this.omegga.version !== 'a5') return;

      const kickedPlayer = this.omegga.findPlayerByName(kicked);
      const kickerPlayer = this.omegga.findPlayerByName(kicker);

      // couldn't find kicked or kicker player
      if (!kickedPlayer || !kickerPlayer) return;

      handleKick(kickedPlayer, kickerPlayer, reason);
    });

    return doc._id;
  }

  // synchronize the ban list with the one in the database
  syncBanList() {
    let banList = this.omegga.getBanList();
    if (!banList) return;
    banList = banList.banList;

    // upsert all bans
    for (const banned in banList) {
      const entry = {
        type: 'banHistory',
        banned,
        bannerId: banList[banned].bannerId,
        created: parseBrickadiaTime(banList[banned].created),
        expires: parseBrickadiaTime(banList[banned].expires),
        reason: banList[banned].reason,
      };
      // depending on implementation, this could potentially check
      // if the ban was already added and emit some kind of
      // new ban event
      this.stores.players.update(entry, {$set: entry}, {upsert: true});
    }
  }

  // determine if this user would be the first user (admin user)
  async isFirstUser() {
    return (await this.stores.users.count({type: 'user'})) === 0;
  }

  // hash a password
  async hash(password) {
    return await bcrypt.hash(password, 10);
  }

  // create an admin user account, username can be blank (no password)
  async createAdminUser(username, password) {
    const hash = await this.hash(password);

    // create an owner user
    const user = this.stores.users.insert({
      // this is a user
      type: 'user',
      created: Date.now(),
      lastOnline: Date.now(),

      // credentials
      username,
      hash,

      // permissions
      isOwner: true,
      roles: [],

      // brickadia player uuid
      playerId: '',
    });
    return user;
  }

  // determine if a user with this name exists
  async userExists(username) {
    return (await this.stores.users.count({type: 'user', username})) > 0;
  }

  // create a regular  user account
  async createUser(username, password) {
    if (await this.userExists(username))
      throw new Error('user already exists');

    const hash = await this.hash(password);
    // create an owner user
    const user = this.stores.users.insert({
      // this is a user
      type: 'user',
      created: Date.now(),
      lastOnline: 0,

      // credentials
      username,
      hash,

      // permissions
      isOwner: false,
      roles: [],

      // brickadia player uuid
      playerId: '',
    });
    return user;
  }

  // set a user's password
  async userPasswd(username, password) {
    const hash = await this.hash(password);

    if (!this.userExists(username)) throw new Error('user does not exist');

    await this.stores.users.update(
      {type: 'user', username},
      {$set: { hash }}
    );
  }

  // get a user from credentials
  async authUser(username, password) {
    const user = await this.stores.users.findOne({ username });
    // user not found
    if (!user || user.isBanned) return null;

    // make sure the user's password hash is valid
    if (await bcrypt.compare(password, user.hash)) {
      // update last online status
      await this.stores.users.update({ _id: user._id }, {$set: {lastOnline: Date.now()}});
      return user;
    }

    // wrong password
    return null;
  }

  // find a user by object id
  async findUserById(id) {
    return await this.stores.users.findOne({ $or: [
      // the owner has no username, so everyone is the owner
      { type: 'user', username: '', isOwner: true },

      // the user exists and has an id
      { type: 'user', _id: id },
    ] });
  }

  // get a list of roles
  getRoles() {
    return this.stores.server.find({ type: 'role' });
  }

  // add a chat message to the chat log store
  async addChatLog(action, user, message) {
    this.calendar.addDate(Date.now());
    return await this.stores.chat.insert({
      type: 'chat',
      created: Date.now(),
      instanceId: await this.getInstanceId(),
      action,
      user,
      ...(message ? {message} : {}),
    });
  }

  // get recent chat activity
  async getChats({count=50, sameServer, before, after}={}) {
    return await this.stores.chat.cfind({
      type: 'chat',
      ...(sameServer ? {instanceId: await this.getInstanceId()} : {}),
      created:
        before ? { $lt: before } :
          after ? { $gt: after } :
            { $lt: Date.now() }

    })
      .sort({ created: !before && after ? 1 : -1 })
      .limit(count)
      .exec();
  }

  // get paginated players
  async getPlayers({count=50, search='', page=0, sort='name', direction='1', limitId=undefined}={}) {
    const pattern = explode(search);

    // the query used for finding which players are available
    const query = {
      type: 'userHistory',
      // only filter if there's a query
      $and: [
        // if a limitId is passed in, the id must be in it
        ...(limitId ? [{id: {$in: limitId}}] : []),

        // if there's a search, the search matches...
        ...(search.length > 0 ? [{$or: [
          // id was pasted in
          {id: search},
          // user's current name
          {name: {$regex: pattern}},
          // user's past name
          {nameHistory: {$elemMatch: {name: {$regex: pattern}}}},
        ]}] : []),
      ],
    };

    // count players and query players
    const [total, players] = await Promise.all([
      this.stores.players.count(query),
      this.stores.players.cfind(query)
        // TODO: add other sorts and sort directions
        .sort({[sort]: direction})
        .skip(count * page)
        .limit(count)
        .exec()
    ]);

    return {
      pages: Math.ceil(total / count),
      total,
      players,
    };
  }

  // get paginated users
  async getUsers({count=50, search='', page=0, sort='name', direction='1'}={}) {
    const pattern = explode(search);

    // the query used for finding which players are available
    const query = {
      type: 'user',
      // only filter if there's a query
      ...(search.length > 0 ? {$or: [
        // id was pasted in
        {playerId: search},
        // user's current name
        {name: {$regex: pattern}},
      ]} : {}),
    };

    // count players and query players
    const [total, users] = await Promise.all([
      this.stores.users.count(query),
      this.stores.users.cfind(query)
        // TODO: add other sorts and sort directions
        .sort({[sort]: direction})
        .skip(count * page)
        .limit(count)
        .exec()
    ]);

    return {
      pages: Math.ceil(total / count),
      total,
      users,
    };
  }

  // get an individual player, ban and kick history, and notes
  async getPlayer(id) {
    const [player, banHistory, kickHistory, notes] = await Promise.all([
      this.stores.players.findOne({ type: 'userHistory', id }),
      this.stores.players
        .cfind({ type: 'banHistory', banned: id })
        .sort({created: -1})
        .limit(25)
        .exec(),
      this.stores.players
        .cfind({ type: 'kickHistory', kicked: id })
        .sort({created: -1})
        .limit(25)
        .exec(),
      this.stores.players
        .cfind({ type: 'note', id })
        .sort({created: -1})
        .limit(25)
        .exec(),
    ]);

    if (!player) return null;

    return { ...player, banHistory, kickHistory, notes };
  }

  // add a user to the visit history, returns true if this is a first visit
  async addVisit(user) {
    const existing = await this.stores.players.findOne({ type: 'userHistory', id: user.id });
    const now = Date.now();
    const instanceId = await this.getInstanceId();
    if (!existing) {
      // create the player
      // TODO: add some form of admin note tool for moderators to leave notes
      // on troublesome players + warnings
      await this.stores.players.insert({
        type: 'userHistory',
        // base brickadia user info
        id: user.id,
        name: user.name,
        // list of names and when they were first used
        nameHistory: [{name: user.name, date: now}],
        // list of ips this player has been on
        ips: [],
        // first time player was seen
        created: now,
        // last time player was seen
        lastSeen: now,
        // last server this player has been on
        lastInstanceId: instanceId,
        // number of status checks this player has observed
        heartbeats: 0,
        // number of sessions (at least an hour apart) this player has had
        sessions: 1,
        // number of instances (times omegga was started) this player has joined
        instances: 1,
      });
      return true;
    } else {
      await this.stores.players.update(
        { _id: existing._id },
        {
          $inc: {
            // increment number of sessions if the player hasn't been seen for an hour
            sessions: existing.lastSeen < now - 60 * 60 * 1000 ? 1 : 0,
            // increment the number of instances this player has joined
            instances: existing.lastInstanceId === instanceId ? 1 : 0,
          },

          $set: {
            // update last seen time and user name
            lastSeen: now,
            name: user.name,

            // set the last joined instance
            lastInstanceId: instanceId,
          },

          // add the name to the history if it was not already in it
          ...(existing.nameHistory.some(h => h.name === user.name) ? {} : {
            $addToSet: { nameHistory: {name: user.name, date: now} },
          }),
        },
      );
      return false;
    }
  }

  // use data from minutely heartbeats to fuel metrics
  async addHeartbeat(data) {
    const now = Date.now();

    // add the heartbeat to the server status store
    await this.stores.status.insert({
      type: 'heartbeat',
      created: now,
      bricks: data.bricks,
      players: data.players,
    });

    // update player heartbeats and last seens
    await this.stores.players.update({
      // all players in the status update
      id: {$in: data.players}
    }, {
      // update last seen
      $set: { lastSeen: now },
      // increment heartbeats
      $inc: { heartbeats: 1 },
    }, {multi: true});

    // get all players in the status update
    const players = await this.stores.players.find({id: {$in: data.players}});

    await Promise.all(players
      // find players without the discovered ip
      .filter(p => !(p.ips || []).includes(data.ips[p.id]))
      // insert the IP into the player's ip list
      .map(p => this.stores.players.update({ _id: p._id }, {
        $addToSet: { ips: data.ips[p.id] }
      })));
  }

  // update player online-time punchcard
  async updatePlayerPunchcard(numNewPlayers) {
    // get date, utc hour, and utc day
    const now = new Date();
    const time = now.getTime();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    const month = now.getUTCMonth();
    const year = now.getUTCFullYear();

    // find the punchcard
    const card = await this.stores.status.findOne({
      type: 'punchcard',
      kind: 'playerCount',
      month, year,
    });

    // create a new punchcard if one does not exist for this month
    if (!card) {
      const punchcard = createPunchcard();
      punchcard[day][hour] = numNewPlayers;
      // insert it
      await this.stores.status.insert({
        type: 'punchcard',
        kind: 'playerCount',
        created: time,
        updated: time,
        month, year,
        punchcard,
      });

    // if the card exists, check if it was already updated this hour
    } else {
      // add the players to this slot
      card.punchcard[day][hour] += numNewPlayers;
      // update the punchcard
      await this.stores.status.update({ _id: card._id }, {
        $set: {
          punchcard: card.punchcard,
          updated: time,
        },
      });
    }
  }
}

module.exports = Database;
