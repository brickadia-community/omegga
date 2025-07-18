import { IconCheck, IconX } from '@tabler/icons-react';
import {
  useCallback,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Button } from '../button';
import { Dimmer } from '../dimmer';
import { Footer } from '../footer';
import { Header } from '../header';
import { PopoutContent } from '../popout';

export const Modal = ({
  visible,
  children,
}: PropsWithChildren<{ visible: boolean }>) => (
  <div className={`modal ${visible ? 'visible' : ''}`}>
    <div className="modal-content">{children}</div>
  </div>
);

export const useConfirm = <T = boolean,>({
  leftButton,
  rightButton,
  title,
  content,
}: {
  title?: string;
  content?: ReactNode;
  leftButton?: (confirm: (ok: T) => void) => React.ReactNode;
  rightButton?: (confirm: (ok: T) => void) => React.ReactNode;
} = {}) => {
  const [confirm, setConfim] = useState({
    show: false,
    message: '',
    children: null as ReactNode | null,
    resolve: (_val: T) => {},
  });
  const prompt = useCallback(
    (message?: string | ReactNode) =>
      new Promise<T>(resolve => {
        setConfim({
          message: typeof message === 'string' ? message : '',
          children: typeof message !== 'string' && message ? message : null,
          show: true,
          resolve(val: T) {
            resolve(val);
            setConfim({
              show: false,
              message: '',
              children: null,
              resolve: () => {},
            });
          },
        });
      }),
    [],
  );

  return {
    prompt,
    children: (
      <Dimmer visible={confirm.show}>
        <Modal visible>
          <Header attached>{title ?? 'Confirmation'}</Header>
          <PopoutContent>
            {content ?? confirm.children ?? (
              <p>Are you sure you want to {confirm.message}?</p>
            )}
          </PopoutContent>
          <Footer attached>
            {leftButton?.(confirm.resolve) ?? (
              <Button main onClick={() => confirm.resolve(true as T)}>
                <IconCheck />
                Yes
              </Button>
            )}
            <div style={{ flex: 1 }} />
            {rightButton?.(confirm.resolve) ?? (
              <Button normal onClick={() => confirm.resolve(false as T)}>
                <IconX />
                No
              </Button>
            )}
          </Footer>
        </Modal>
      </Dimmer>
    ),
  };
};
