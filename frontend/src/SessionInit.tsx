import { useEffect } from 'react';
import { trpc } from './trpc';
import { $omeggaData, $roles, $showLogout, $user } from './stores/user';
import { $version } from './stores/version';
import { $rpcConnected, $rpcDisconnected } from './stores/connected';

export const SessionInit = () => {
  const { data, status } = trpc.session.info.useQuery();

  useEffect(() => {
    if (status === 'success' && data) {
      $omeggaData.set(data);
      $version.set(data.version);
      $user.set(data.user);
      $roles.set(data.roles);
      $showLogout.set(data.canLogOut);
      $rpcConnected.set(true);
      $rpcDisconnected.set(false);
    } else if (status === 'error') {
      $rpcConnected.set(false);
      $rpcDisconnected.set(true);
    }
  }, [data, status]);

  return null;
};
