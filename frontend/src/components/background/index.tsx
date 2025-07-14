import { useStore } from '@nanostores/react';
import type React from 'react';
import { $version } from '../../versionStore';

export const Background: React.FC<React.PropsWithChildren> = ({ children }) => {
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
