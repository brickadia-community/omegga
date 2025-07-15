import type { PropsWithChildren } from 'react';

export const Dimmer = ({
  visible,
  children,
}: PropsWithChildren<{ visible: boolean }>) => (
  <div className={`dimmer ${visible ? 'visible' : ''}`}>
    <div className="dimmer-content">{children}</div>
  </div>
);
