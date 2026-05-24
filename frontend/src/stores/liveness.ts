import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { useEffect } from 'react';
import { useHasScope } from '@hooks';
import { Permissions } from '../permissions';
import { handleGlobalError, trpc, trpcClient } from '../trpc';

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
  const canStatus = useHasScope(Permissions.ServerStatus);
  const { data } = trpc.server.started.useQuery(undefined, {
    enabled: canStatus,
  });

  useEffect(() => {
    if (data) {
      $liveness.set({
        started: data.started,
        starting: data.starting,
        stopping: data.stopping,
        loading: false,
      });
    }
  }, [data]);

  trpc.server.onStatus.useSubscription(undefined, {
    enabled: canStatus,
    onError: handleGlobalError,
    onData(data) {
      $liveness.set({
        started: data.started,
        starting: data.starting,
        stopping: data.stopping,
        loading: false,
      });
    },
  });

  return useStore($liveness);
};

export async function getServerStarted() {
  $liveness.set({ ...$liveness.get(), loading: true });
  const { started, starting, stopping } =
    await trpcClient.server.started.query();
  $liveness.set({
    started,
    stopping,
    starting,
    loading: false,
  });
}

export const startServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  trpcClient.server.start.mutate();
};
export const stopServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  trpcClient.server.stop.mutate();
};
export const restartServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  trpcClient.server.restart.mutate();
};
export const updateServer = () => {
  $liveness.set({ ...$liveness.get(), loading: true });
  trpcClient.server.update.run.mutate();
};
