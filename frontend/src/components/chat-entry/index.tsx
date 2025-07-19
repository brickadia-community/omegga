import type { HistoryRes } from '@omegga/webserver/backend/api';
import type { IChatUser } from '@omegga/webserver/backend/types';
import { IconLink } from '@tabler/icons-react';
import Linkify from 'linkify-react';
import { Link, useRoute } from 'wouter';
import { ChatTime } from '../chat-time';

export const UserName = ({
  color,
  user,
  link,
  className,
}: {
  color?: boolean;
  link?: boolean;
  user?: Partial<IChatUser>;
  className?: string;
}) => {
  const props = {
    className,
    style: color ? { color: `#${user?.color}` } : undefined,
    'data-tooltip': [
      user?.name && `Username: ${user?.name}`,
      user?.displayName && `Display Name: ${user?.displayName}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };

  if (link && user?.id)
    return (
      <Link href={`/players/${user.id}`} {...props}>
        {user?.displayName ?? user?.name}
      </Link>
    );

  return <span {...props}>{user?.displayName ?? user?.name}</span>;
};

export const ChatEntry = ({ log }: { log: HistoryRes[number] }) => {
  const [_match, params] = useRoute('/history/:time?');
  const isFocused = params?.time === log.created + '';

  return (
    <div className={`log-entry ${isFocused ? 'focused' : ''}`}>
      <div className="log-row">
        <Link
          href={`/history/${isFocused ? '' : log.created}`}
          className="time-link"
        >
          <IconLink />
          <ChatTime time={log.created} />
        </Link>
        {log.action === 'msg' && (
          <div className="chat-message message">
            {log.user.web ? '[' : ''}
            {log.user.web ? (
              <UserName color user={log.user} />
            ) : (
              <UserName link color className="user" user={log.user} />
            )}
            {log.user.web ? ']' : ''}:{' '}
            <Linkify as="span">{log.message}</Linkify>
          </div>
        )}
        {log.action === 'leave' && (
          <div className="message join-message">
            <UserName link className="user" user={log.user} /> left the game.
          </div>
        )}
        {log.action === 'join' && (
          <div className="message join-message">
            <UserName link className="user" user={log.user} /> joined the game
            {log.user.isFirst ? ' for the first time' : ''}.
          </div>
        )}
        {log.action === 'server' && (
          <div className="message server-message">{log.message}</div>
        )}
      </div>
    </div>
  );
};
