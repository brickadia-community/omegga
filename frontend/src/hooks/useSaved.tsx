import { IconCheck } from '@tabler/icons-react';
import { useCallback, useRef, useState } from 'react';

export enum SavedStatus {
  Idle = 'idle',
  Waiting = 'waiting',
  Fired = 'fired',
}

export const useSaved = (callback: () => void, clearCallback?: () => void) => {
  const refs = useRef({
    callback,
    clearCallback,
    firedTimeout: null as unknown as ReturnType<typeof setTimeout>,
    waitingTimeout: null as unknown as ReturnType<typeof setTimeout>,
  });
  refs.current.callback = callback;
  refs.current.clearCallback = clearCallback;
  const [status, setStatus] = useState(SavedStatus.Idle);

  const fire = useCallback(() => {
    clearTimeout(refs.current.waitingTimeout);
    clearTimeout(refs.current.firedTimeout);
    setStatus(SavedStatus.Waiting);

    refs.current.waitingTimeout = setTimeout(() => {
      setStatus(SavedStatus.Fired);

      refs.current.callback();
      refs.current.firedTimeout = setTimeout(() => {
        setStatus(SavedStatus.Idle);
        refs.current.clearCallback?.();
      }, 1000);
    }, 1000);
  }, []);
  const cancel = useCallback(() => {
    clearTimeout(refs.current.waitingTimeout);
    clearTimeout(refs.current.firedTimeout);
    setStatus(SavedStatus.Waiting);
  }, []);

  return { fire, cancel, status };
};

export const SavedSpan = ({ show }: { show: boolean }) => (
  <span className={`saved-note ${show ? 'show' : ''}`}>
    SAVED <IconCheck size="20" />
  </span>
);
