const path = require('path');

const Datastore = require('nedb-promise');
const bcrypt = require('bcrypt');

const soft = require('../../softconfig.js');

// TODO: online users graph
// TODO: player online times
// TODO: bricks over time graph
// TODO: minute server status for metrics
// TODO: chat messages per min/hour/day check

let serverInstance;

// the database keeps track of metrics for omegga
class Database {
  constructor(options, omegga) {
    this.options = options;
    this.omegga = omegga;

    // create all the stores
    this.stores = {
      users: new Datastore({filename: path.join(omegga.dataPath, soft.USER_STORE), autoload: true}),
      chat: new Datastore({filename: path.join(omegga.dataPath, soft.CHAT_STORE), autoload: true}),
      plugin: new Datastore({filename: path.join(omegga.dataPath, soft.PLUGIN_STORE), autoload: true}),
      players: new Datastore({filename: path.join(omegga.dataPath, soft.PLAYER_STORE), autoload: true}),
      status: new Datastore({filename: path.join(omegga.dataPath, soft.STATUS_STORE), autoload: true}),
      server: new Datastore({filename: path.join(omegga.dataPath, soft.SERVER_STORE), autoload: true}),
    };
  }


  // get the running instance id of this omegga
  async getInstanceId() {
    if (serverInstance) return serverInstance._id;
    const doc = await this.stores.server.insert({
      type: 'app:start',
      date: new Date(),
    });
    serverInstance = doc;
    return doc._id;
  }

  // determine if this user would be the first user (admin user)
  async isFirstUser() {
    return (await this.stores.users.count({type: 'user'})) === 0;
  }

  // create an admin user account, username can be blank (no password)
  async createAdminUser(username, password) {
    const hash = await bcrypt.hash(password, 10);
    // create an owner user
    const user = this.stores.users.insert({
      // this is a user
      type: 'user',
      created: Date.now(),

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

  // get a user from credentials
  async authUser(username, password) {
    const user = await this.stores.users.findOne({ username });
    // user not found
    if (!user || user.isBanned) return null;

    // make sure the user's password hash is valid
    if (await bcrypt.compare(password, user.hash))
      return user;

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
  async getRecentChats(count=50) {
    return await this.stores.chat.cfind({
      type: 'chat',
      instanceId: await this.getInstanceId(),
    })
      .sort({ created: 1 })
      .limit(count)
      .exec();
  }
}

module.exports = Database;
