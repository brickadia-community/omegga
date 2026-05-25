import { useStore } from '@nanostores/react';
import type React from 'react';
import { $brickadiaVersion, $version } from '../../stores/version';
import darkBg from '../../../assets/img/dark_bg.webp';
import lightBg from '../../../assets/img/auth_bg.webp';

export const Background = ({ children }: React.PropsWithChildren) => {
  const version = useStore($version);
  const brickadiaVersion = useStore($brickadiaVersion);
  return (
    <div className="background">
      <img className="bg-img dark" src={darkBg} />
      <img className="bg-img light" src={lightBg} />
      {version && (
        <div className="version">
          Omegga v{version}
          {brickadiaVersion != null && brickadiaVersion > 0 && (
            <> Brickadia CL{brickadiaVersion}</>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
