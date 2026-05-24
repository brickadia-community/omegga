import { TRPCClientError } from '@trpc/client';
import { useEffect } from 'react';
import { $rpcConnected, $rpcDisconnected } from './stores/connected';
import {
  $omeggaData,
  $resolvedScopes,
  $roles,
  $showLogout,
  $user,
} from './stores/user';
import { $version } from './stores/version';
import { trpc } from './trpc';

export const SessionInit = () => {
  const { data, status, error } = trpc.session.info.useQuery();

  useEffect(() => {
    if (status === 'success' && data) {
      $omeggaData.set(data);
      $version.set(data.version);
      $user.set(data.user);
      $roles.set(data.roles);
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
