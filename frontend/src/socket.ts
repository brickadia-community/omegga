import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from 'json-rpc-2.0';
import io from 'socket.io-client';
import { $rpcConnected, $rpcDisconnected } from './stores/connected';
import { $liveness } from './stores/liveness';
import {
  $omeggaData,
  $roles,
  $showLogout,
  $user,
  type OmeggaSocketData,
} from './stores/user';
import { $version } from './stores/version';

export const socket = io();

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
socket.on(
  'status',
  ({
    started,
    starting,
    stopping,
  }: {
    started: boolean;
    starting: boolean;
    stopping: boolean;
  }) => {
    $liveness.set({ started, starting, stopping, loading: false });
  }
);

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
