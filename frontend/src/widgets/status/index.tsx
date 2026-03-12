import { Loader, Scroll } from '@components';
import type { IServerStatus } from '@omegga/types';
import { duration } from '@utils';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '../../trpc';

export const StatusWidget = () => {
  const [status, setStatus] = useState<IServerStatus | null>(null);

  const { data: queryStatus } = trpc.server.status.useQuery();

  // Sync query data into state so subscription updates merge seamlessly
  useEffect(() => {
    if (queryStatus && !status) {
      setStatus(queryStatus);
    }
  }, [queryStatus]);

  trpc.server.onHeartbeat.useSubscription(undefined, {
    onData: setStatus,
  });

  return (
    <div className="status-widget">
      {status?.players && (
        <Scroll className="players">
          <div className="players-child">
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
                      <Link className="user" to={'/players/' + player.id}>
                        {player.name}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {duration(player.time)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{player.ping}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Scroll>
      )}
      {!status?.players && (
        <Loader blur size="huge">
          Loading Status
        </Loader>
      )}
    </div>
  );
};
