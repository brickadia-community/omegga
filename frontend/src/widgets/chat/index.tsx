import { Button, Footer, Input, Scroll, UserName } from '@components';
import type { IStoreChat } from '@backend/types';
import { IconSend } from '@tabler/icons-react';
import Linkify from 'linkify-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { trpc } from '../../trpc';

type ChatEntry = IStoreChat & {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
};

export const ChatWidget = () => {
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [message, setMessage] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  const sendMutation = trpc.chat.send.useMutation();

  const scrollToBottom = () => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  };

  const { data: recentChats } = trpc.chat.recent.useQuery();

  useEffect(() => {
    if (recentChats) {
      setChats(recentChats.slice().reverse());
    }
  }, [recentChats]);

  trpc.chat.onMessage.useSubscription(undefined, {
    onData: (log: ChatEntry) => {
      setChats(prevChats => {
        const updatedChats = [...prevChats, log];
        return updatedChats.length > 50
          ? updatedChats.slice(updatedChats.length - 50)
          : updatedChats;
      });
    },
  });

  useLayoutEffect(() => {
    scrollToBottom();
  }, [chats]);

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();

    if (message.length > 140 || message.length === 0) return;

    sendMutation.mutate(message);
    setMessage('');
  };

  return (
    <div className="chat-widget">
      <Scroll className="messages" ref={ref}>
        <div className="messages-child">
          {chats.map(log => (
            <div key={log._id} className="log-entry">
              {log.action === 'msg' && (
                <div className="chat-message">
                  {log.user?.web ? '[' : ''}
                  <UserName color user={log.user} />
                  {log.user?.web ? ']' : ''}:{' '}
                  <Linkify as="span">{log.message}</Linkify>
                </div>
              )}
              {log.action === 'leave' && (
                <div className="join-message">
                  <UserName user={log.user} /> left the game.
                </div>
              )}
              {log.action === 'join' && (
                <div className="join-message">
                  <UserName user={log.user} /> joined the game
                  {log.user?.isFirst ? ' for the first time' : ''}.
                </div>
              )}
              {log.action === 'server' && (
                <Linkify as="div" className="server-message">
                  {log.message}
                </Linkify>
              )}
            </div>
          ))}
        </div>
      </Scroll>
      <form onSubmit={sendMessage}>
        <Footer>
          <Input
            roboto
            type="text"
            placeholder="Message"
            value={message}
            onChange={v => setMessage(v)}
          />
          <Button
            normal
            icon
            style={{ marginLeft: '10px' }}
            onClick={sendMessage}
          >
            <IconSend />
          </Button>
        </Footer>
      </form>
    </div>
  );
};
