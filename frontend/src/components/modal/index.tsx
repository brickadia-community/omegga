import type { PropsWithChildren } from 'react';

export const Modal = ({
  visible,
  children,
}: PropsWithChildren<{ visible: boolean }>) => (
  <div className={`modal ${visible ? 'visible' : ''}`}>
    <div className="modal-content">{children}</div>
  </div>
);
