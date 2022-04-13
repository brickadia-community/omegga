import { MatchGenerator } from './types';

import join from './join';
// 'join' event => { name, id, state, controller }

import leave from './leave';
// 'leave' event => { name, id, state, controller }

import chat from './chat';
// 'chat' event => name, message; 'chatcmd:command' event => name, [...args]
// 'kick' event => name, kicker, reason

import command from './command';
// 'cmd:command' event => name, args (string)

import auth from './auth';
// assigns host, 'host' event, 'start' event, 'unauthorized' event

import exit from './exit';
// 'exit' event

import version from './version';
// 'version' event, check game version

import init from './init';
// watch loginit for any funny business

import mapChange from './mapChange';
// 'mapchange' event

// interaction event
import interact from './interact';

export default [
  join,
  leave,
  chat,
  command,
  auth,
  exit,
  version,
  init,
  mapChange,
  interact,
] as MatchGenerator<any>[];
