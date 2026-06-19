import { Loader, Scroll } from '@components';
import { useHasScope } from '@hooks';
import type { IServerStatus } from '@omegga/types';
import { duration } from '@utils';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Permissions } from '../../permissions';
import { handleGlobalError, trpc } from '../../trpc';

export const StatusWidget = () => {
  const canStatus = useHasScope(Permissions.ServerStatus);
  const canPlayerList = useHasScope(Permissions.PlayerList);
  const [status, setStatus] = useState<IServerStatus | null>(null);

  const { data: queryStatus } = trpc.server.status.useQuery(undefined, {
    enabled: canStatus,
  });

  useEffect(() => {
    if (queryStatus && !status) {
      setStatus(queryStatus);
    }
  }, [queryStatus]);

  trpc.server.onHeartbeat.useSubscription(undefined, {
    enabled: canStatus,
    onError: handleGlobalError,
    onData: setStatus,
  });

  return (
    <div className="status-widget">
      {status?.players && (
        <div className="players">
          <div className="stats">
            <div className="stat">
              <b>Name:</b> {status.serverName}
            </div>
            <div className="stat">
              <b>Uptime:</b> {duration(status.time)}
            </div>
            <div className="stat">
              <b>Bricks:</b> {status.bricks}
            </div>
            <div className="stat">
              <b>Players:</b> {status.players.length}
            </div>
          </div>
          <Scroll className="player-table">
            <table className="br-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: '100%' }}>Name</th>
                  <th>Time</th>
                  <th>Ping</th>
                </tr>
              </thead>
              <tbody>
                {status.players.map(player => (
                  <tr key={player.address + player.id}>
                    <td>
                      {canPlayerList ? (
                        <Link className="user" to={'/players/' + player.id}>
                          {player.name}
                        </Link>
                      ) : (
                        <span className="user">{player.name}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {duration(player.time)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{player.ping}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        </div>
      )}
      {!status?.players && (
        <Loader blur size="huge">
          Loading Status
        </Loader>
      )}
    </div>
  );
};
