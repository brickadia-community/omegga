import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { useEffect } from 'react';
import { ioEmit, rpcReq } from '../socket';

export const $liveness = atom<{
  starting: boolean;
  started: boolean;
  stopping: boolean;
  loading: boolean;
}>({
  starting: false,
  started: false,
  stopping: false,
  loading: true,
});

export const useServerLiveness = () => {
  useEffect(() => {
    ioEmit('subscribe', 'server');
    getServerStarted();
    return () => {
      ioEmit('unsubscribe', 'server');
    };
  }, []);

  return useStore($liveness);
};

export async function getServerStarted() {
  $liveness.set({ ...$liveness.get(), loading: true });
  const { started, starting, stopping } = await rpcReq('server.started');
  $liveness.set({
    started,
    stopping,
    starting,
    loading: false,
  });
}

export const startServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  rpcReq('server.start');
};
export const stopServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  rpcReq('server.stop');
};
export const restartServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  rpcReq('server.restart');
};
export const updateServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  rpcReq('server.update');
};
