import { useHasScope } from '@hooks';
import { TRPCClientError } from '@trpc/client';
import { useEffect, useState } from 'react';
import { Permissions } from './permissions';
import { $rpcConnected, $rpcDisconnected } from './stores/connected';
import {
  $omeggaData,
  $resolvedScopes,
  $showLogout,
  $user,
} from './stores/user';
import { $brickadiaVersion, $version } from './stores/version';
import { handleGlobalError, trpc } from './trpc';

export const SessionInit = () => {
  const { data, status, error } = trpc.session.info.useQuery();

  // Title the page "<server name> - <player count>" when the user can view the
  // server status and a status is available, otherwise just "Omegga".
  const canStatus = useHasScope(Permissions.ServerStatus);

  // server name for the title (rarely changes; the query value is enough)
  const { data: serverStatus } = trpc.server.status.useQuery(undefined, {
    enabled: canStatus,
  });

  // live player count - updates on join / leave / server stop
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  trpc.server.onPlayerCount.useSubscription(undefined, {
    enabled: canStatus,
    onError: handleGlobalError,
    onData: setPlayerCount,
  });

  // depend on narrowed primitives, not the whole status object (which is a
  // fresh reference every heartbeat refetch)
  const hasStatus = !!serverStatus;
  const serverName = serverStatus?.serverName ?? null;
  const queryCount = serverStatus?.players?.length ?? null;
  useEffect(() => {
    if (!canStatus || !hasStatus) {
      document.title = 'Omegga';
      return;
    }
    const count = playerCount ?? queryCount;
    const name = serverName ?? 'Brickadia Server';
    document.title = count != null ? `${name} - ${count}` : name;
  }, [canStatus, hasStatus, serverName, queryCount, playerCount]);

  useEffect(() => {
    if (status === 'success' && data) {
      $omeggaData.set(data);
      $version.set(data.version);
      $brickadiaVersion.set(data.brickadiaVersion);
      $user.set(data.user);
      $resolvedScopes.set(data.user.resolvedScopes ?? {});
      $showLogout.set(data.canLogOut);
      $rpcConnected.set(true);
      $rpcDisconnected.set(false);
    } else if (status === 'error') {
      $rpcConnected.set(false);
      $rpcDisconnected.set(true);
      if (
        error instanceof TRPCClientError &&
        error.data?.code === 'UNAUTHORIZED'
      ) {
        location.reload();
      }
    }
  }, [data, status]);

  return null;
};
