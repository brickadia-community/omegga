import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from 'json-rpc-2.0';
import { atom } from 'nanostores';
import io from 'socket.io-client';
import { $version } from './versionStore';

export type OmeggaSocketData = {
  roles: { type: 'role'; name: string }[];
  version: string;
  canLogOut: boolean;
  now: number;
  userless: boolean;
  user: {
    username: string;
    isOwner: boolean;
    roles: string[];
  };
};

export const socket = io();

export const $rpcConnected = atom(false);
export const $rpcDisconnected = atom(false);
export const $showLogout = atom(false);
export const $user = atom<OmeggaSocketData['user'] | null>(null);
export const $roles = atom<OmeggaSocketData['roles']>([]);
export const $omeggaData = atom<OmeggaSocketData | null>(null);

socket.on('connect', () => {
  console.info('[socket] Connected');
  $rpcConnected.set(true);
  $rpcDisconnected.set(false);
});
socket.on('disconnect', () => {
  console.info('[socket] Disconnected');
  $rpcConnected.set(false);
  $rpcDisconnected.set(true);
});
socket.on('data', (data: OmeggaSocketData) => {
  $omeggaData.set(data);
  $version.set(data.version);
  $user.set(data.user);
  $roles.set(data.roles);
  $showLogout.set(data.canLogOut);
});
socket.on('rpc', (payload: unknown) => {
  rpc.receiveAndSend(payload);
});

export const rpcServer = new JSONRPCServer();
export const rpcClient = new JSONRPCClient(async data => {
  socket.emit('rpc', data);
});
export const rpc = new JSONRPCServerAndClient(rpcServer, rpcClient);

export const rpcReq = (type: string, ...args: any[]) =>
  rpc.request(type, ...args);
export const rpcNotify = (type: string, ...args: any[]) =>
  rpc.notify(type, ...args);
export const ioEmit = (type: string, ...args: any[]) =>
  socket.emit(type, ...args);
