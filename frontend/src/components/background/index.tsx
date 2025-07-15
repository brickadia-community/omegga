import { useStore } from '@nanostores/react';
import type React from 'react';
import { $version } from '../../stores/version';

export const Background = ({ children }: React.PropsWithChildren) => {
  const version = useStore($version);
  return (
    <div className="background">
      <img className="bg-img dark" src="/public/img/dark_bg.webp" />
      <img className="bg-img light" src="/public/img/auth_bg.webp" />
      {version && <div className="version">Omegga v{version}</div>}
      {children}
    </div>
  );
};
