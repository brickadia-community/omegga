import { IconLink } from '@tabler/icons-react';
import { ChatTime } from '../chat-time';
import { Link, useRoute } from 'wouter';

export const ChatEntry = ({ log }: { log: any }) => {
  const [_match, params] = useRoute('/history/:time?');
  const isFocused = params?.time === log.created;

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
              <span className="user" style={{ color: `#${log.user.color}` }}>
                {log.user.name}
              </span>
            ) : (
              <Link
                href={`/players/${log.user.id}`}
                className="user"
                style={{ color: `#${log.user.color}` }}
              >
                {log.user.name}
              </Link>
            )}
            {log.user.web ? ']' : ''}: <span>{log.message}</span>
          </div>
        )}
        {log.action === 'leave' && (
          <div className="message join-message">
            <Link href={`/players/${log.user.id}`} className="user">
              {log.user.name}
            </Link>{' '}
            left the game.
          </div>
        )}
        {log.action === 'join' && (
          <div className="message join-message">
            <Link href={`/players/${log.user.id}`} className="user">
              {log.user.name}
            </Link>{' '}
            joined the game{log.user.isFirst ? ' for the first time' : ''}.
          </div>
        )}
        {log.action === 'server' && (
          <div className="message server-message">{log.message}</div>
        )}
      </div>
    </div>
  );
};
