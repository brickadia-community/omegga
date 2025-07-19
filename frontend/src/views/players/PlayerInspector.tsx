import {
  Button,
  Dimmer,
  Dropdown,
  Footer,
  Header,
  Input,
  Loader,
  Modal,
  NavBar,
  PopoutContent,
  Scroll,
} from '@components';
import type { GetPlayerRes } from '@omegga/webserver/backend/api';
import {
  IconBackspace,
  IconBan,
  IconCaretDown,
  IconCaretUp,
  IconEraser,
  IconPlug,
  IconX,
} from '@tabler/icons-react';
import { duration, heartbeatAgo, isoDate, isoTime } from '@utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { rpcReq } from '../../socket';

const UNIT_SCALARS = {
  'Minute(s)': 1,
  'Hour(s)': 60,
  'Day(s)': 24 * 60,
  'Week(s)': 24 * 60 * 7,
  'Month(s)': 24 * 60 * 30,
};

const UNIT_OPTIONS = [
  'Permanent',
  'Minute(s)',
  'Hour(s)',
  'Day(s)',
  'Week(s)',
  'Month(s)',
];

export const PlayerInspector = () => {
  const [_match, params] = useRoute('/players/:id');
  const [_loc, navigate] = useLocation();

  const [modal, setModal] = useState<'ban' | 'kick' | 'clear' | null>(null);
  const [player, setPlayer] = useState<GetPlayerRes | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [reason, setReason] = useState('');
  const [banDuration, setBanDuration] = useState(10);
  const [banUnit, setBanUnit] = useState('Permanent');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const getPlayer = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);
    const player: GetPlayerRes | null = await rpcReq('player.get', params!.id);
    if (!player) return navigate('/players');
    setPlayer(player);
    setLoading(false);
  }, [params?.id]);

  useEffect(() => {
    getPlayer();
  }, [getPlayer]);

  const ban = async () => {
    if (!player!.id) return;
    setActionLoading(true);
    const duration =
      banUnit === 'Permanent'
        ? -1
        : banDuration * UNIT_SCALARS[banUnit as keyof typeof UNIT_SCALARS];
    try {
      await rpcReq('player.ban', player!.id, duration, reason);
    } catch (err) {
      console.error('Failed to ban player:', err);
    }
    setModal(null);
    getPlayer();
    setActionLoading(false);
  };
  const kick = async () => {
    if (!player!.id) return;
    setActionLoading(true);
    try {
      await rpcReq('player.kick', player!.id, reason);
    } catch (err) {
      console.error('Failed to kick player:', err);
    }
    setModal(null);
    getPlayer();
    setActionLoading(false);
  };
  const unban = async () => {
    if (!player!.id) return;
    setActionLoading(true);
    try {
      await rpcReq('player.unban', player!.id);
    } catch (err) {
      console.error('Failed to unban player:', err);
    }
    getPlayer();
    setActionLoading(false);
  };
  const clearBricks = async () => {
    if (!player!.id) return;
    setActionLoading(true);
    try {
      await rpcReq('player.clearbricks', player!.id);
    } catch (err) {
      console.error('Failed to clear bricks:', err);
    }
    setActionLoading(false);
    setModal(null);
  };

  const expiry = useMemo(() => {
    if (banUnit === 'Permanent') return 'Never';
    return isoTime(
      Date.now() +
        UNIT_SCALARS[banUnit as keyof typeof UNIT_SCALARS] *
          60 *
          1000 *
          banDuration,
    );
  }, [banUnit, banDuration]);

  return (
    <div className="player-inspector-container">
      <NavBar attached>
        {player?.name || 'SELECT A PLAYER'}
        <span style={{ flex: 1 }} />
        {player && (
          <div className="widgets-container">
            <Button normal boxy onClick={() => setShowActions(!showActions)}>
              {showActions ? <IconCaretUp /> : <IconCaretDown />}
              User Actions
            </Button>
            <div
              className="widgets-list"
              style={{ display: showActions ? 'block' : 'none' }}
            >
              <Button
                boxy
                warn
                disabled={actionLoading}
                onClick={() => {
                  setModal('clear');
                  setShowActions(false);
                }}
              >
                <IconEraser />
                Clear Bricks
              </Button>
              {!player.isHost && player.isOnline && (
                <Button
                  boxy
                  error
                  disabled={actionLoading}
                  onClick={() => {
                    setModal('kick');
                    setShowActions(false);
                  }}
                >
                  <IconPlug />
                  Kick
                </Button>
              )}
              {player.currentBan && (
                <Button
                  boxy
                  warn
                  disabled={actionLoading}
                  onClick={() => {
                    unban();
                    setShowActions(false);
                  }}
                >
                  <IconBackspace />
                  Unban
                </Button>
              )}
              {!player.isHost && (
                <Button
                  boxy
                  error
                  disabled={actionLoading}
                  onClick={() => {
                    setModal('ban');
                    setShowActions(false);
                  }}
                >
                  <IconBan />
                  Ban
                </Button>
              )}
            </div>
          </div>
        )}
      </NavBar>
      <div className="player-inspector">
        <div className="player-view">
          <Loader active={loading} size="huge">
            Loading Player
          </Loader>
          <div className="player-info">
            {!loading && player && (
              <Scroll>
                <div className="stats">
                  <div className="stat">
                    <b>Profile:</b>{' '}
                    <a
                      href={'https://brickadia.com/users/' + player.id}
                      target="_blank"
                    >
                      {player.name}
                    </a>
                  </div>
                  <div className="stat">
                    <b>Display Name:</b> {player.displayName ?? 'unknown'}
                  </div>
                  <div className="stat">
                    <b>Host:</b> {player.isHost ? 'Yes' : 'No'}
                  </div>
                  <div className="stat">
                    <b>Banned:</b>{' '}
                    {player.currentBan && player.currentBan.duration <= 0 ? (
                      <span>Permanent</span>
                    ) : player.currentBan ? (
                      <span>
                        {duration(player.currentBan.remainingTime)} of{' '}
                        {duration(player.currentBan.duration)} remaining
                      </span>
                    ) : (
                      <span>No</span>
                    )}
                  </div>
                  <div className="stat">
                    <b data-tooltip="Number of status heartbeats this player has been part of">
                      Time Played:
                    </b>{' '}
                    {heartbeatAgo(player.heartbeats)}
                  </div>
                  <div className="stat">
                    <b data-tooltip="Date player was last seen">Last Seen:</b>{' '}
                    <span data-tooltip={new Date(player.lastSeen)}>
                      {duration(player.seenAgo)} ago
                    </span>
                  </div>
                  <div className="stat">
                    <b data-tooltip="Date player was first seen">First Seen:</b>{' '}
                    <span data-tooltip={new Date(player.created)}>
                      {duration(player.createdAgo)} ago
                    </span>
                  </div>
                  <div className="stat">
                    <b data-tooltip="Number of times this player has visited the server (new visits are registered if the player joins 3 hours after last seen)">
                      Visits:
                    </b>{' '}
                    {player.sessions}
                  </div>
                  <div className="stat">
                    <b data-tooltip="Number of server instances this player has joined">
                      Server Visits:
                    </b>{' '}
                    {player.instances}
                  </div>
                  <div className="stat">
                    <b>Bans:</b> {player.banHistory.length}
                  </div>
                </div>
                <div
                  className="section-header"
                  data-tooltip="Roles this player has"
                >
                  Roles
                </div>
                <div className="option-list">
                  {player.roles.map(r => (
                    <div className="option-item" key={r.name}>
                      <div
                        className="option-name"
                        style={{ color: '#' + r.color }}
                      >
                        {r.name}
                      </div>
                    </div>
                  ))}
                  <div className="option-item">
                    <div className="option-name" style={{ color: 'white' }}>
                      Default
                    </div>
                  </div>
                </div>
                <div
                  className="section-header"
                  data-tooltip="Names this player has gone by historically"
                >
                  Name History
                </div>
                <table className="br-table name-history">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', width: '100%' }}>
                        <span>Name</span>
                      </th>
                      <th>First Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.nameHistory.map(h => (
                      <tr key={h.date + h.name}>
                        <td>
                          {/* If the display name is not set, show the username */}
                          <div
                            data-tooltip={
                              h.displayName ? 'Display Name' : 'Username'
                            }
                          >
                            {h.displayName ?? h.name}
                          </div>
                          {/* If the display name is set, display the username below */}
                          {h.displayName && (
                            <div data-tooltip="Username" className="username">
                              {h.name}
                            </div>
                          )}
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={new Date(h.date)}
                        >
                          {duration(h.ago)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div
                  className="section-header"
                  data-tooltip="Times this player has been banned from the server"
                >
                  Ban History
                </div>
                <table className="br-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100%', textAlign: 'left' }}>
                        Reason
                      </th>
                      <th>Length</th>
                      <th>Issuer</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.banHistory.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <i>None</i>
                        </td>
                      </tr>
                    )}
                    {player.banHistory.map(b => (
                      <tr key={b.created}>
                        <td className="reason">{b.reason}</td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={'Expires ' + new Date(b.expires)}
                        >
                          {0 >= (b.duration ?? -1)
                            ? 'Permanent'
                            : duration(b.duration)}
                        </td>
                        <td>
                          <Link to={'/players/' + b.bannerId}>
                            {b.bannerName || 'missing name'}
                          </Link>
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={new Date(b.created)}
                        >
                          {isoDate(b.created)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div
                  className="section-header"
                  data-tooltip="Times this player has been booted from the server"
                >
                  Kick History
                </div>
                <table className="br-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100%', textAlign: 'left' }}>
                        Reason
                      </th>
                      <th>Issuer</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.kickHistory.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <i>None</i>
                        </td>
                      </tr>
                    )}
                    {player.kickHistory.map(b => (
                      <tr key={b.created}>
                        <td className="reason">{b.reason}</td>
                        <td>
                          <Link to={'/players/' + b.kickerId}>
                            {b.kickerName || 'missing name'}
                          </Link>
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={new Date(b.created)}
                        >
                          {isoDate(b.created)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
            )}
          </div>
        </div>
      </div>
      <Dimmer visible={!!modal}>
        <Loader active={actionLoading} size="huge">
          Running Action...
        </Loader>
        <Modal visible={!actionLoading}>
          <Header>
            {modal === 'ban'
              ? 'Ban Player'
              : modal === 'kick'
                ? 'Kick Player'
                : 'Clear Bricks'}
          </Header>
          {(modal === 'kick' || modal === 'ban') && (
            <div className={`popout-inputs ${modal}`}>
              <Input
                type="text"
                placeholder="Reason"
                value={reason}
                onChange={setReason}
              />
              {modal === 'ban' && (
                <div className="ban-duration" style={{ display: 'flex' }}>
                  {banUnit !== 'Permanent' && (
                    <Input
                      placeholder="Duration"
                      type="number"
                      value={banDuration}
                      onChange={setBanDuration}
                    />
                  )}
                  <Dropdown
                    options={UNIT_OPTIONS}
                    value={banUnit}
                    onChange={u => setBanUnit(u as string)}
                  />
                </div>
              )}
            </div>
          )}
          {modal === 'ban' && (
            <PopoutContent>
              This ban will expire{' '}
              <span style={{ color: 'white' }}>{expiry}</span>.
            </PopoutContent>
          )}
          {modal === 'clear' && (
            <PopoutContent>
              <p style={{ padding: 20 }}>
                Are you sure you want to clear{' '}
                <span style={{ color: 'white' }}>{player?.name ?? '??'}</span>'s
                bricks?
              </p>
            </PopoutContent>
          )}
          <Footer attached>
            {modal === 'ban' && (
              <Button error onClick={ban}>
                <IconBan />
                Ban
              </Button>
            )}
            {modal === 'clear' && (
              <Button warn onClick={clearBricks}>
                <IconEraser />
                Clear Bricks
              </Button>
            )}
            {modal === 'kick' && (
              <Button error onClick={kick}>
                <IconPlug />
                Kick
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button normal onClick={() => setModal(null)}>
              <IconX />
              Cancel
            </Button>
          </Footer>
        </Modal>
      </Dimmer>
    </div>
  );
};
