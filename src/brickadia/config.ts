import { IConfig } from '@config/types';
import fs from 'fs';
import path from 'path';

import * as file from '../util/file';

const CONFIG_PATH = 'Saved/Config/LinuxServer';
const SERVER_SETTINGS = '/ServerSettings.ini';

// Function that writes config
export function write(serverPath: string, config: IConfig) {
  const configPath = path.join(serverPath, CONFIG_PATH);
  const settingsPath = path.join(configPath, SERVER_SETTINGS);

  file.mkdir(configPath);

  fs.writeFileSync(
    settingsPath,
    `[Server__BP_ServerSettings_General_C BP_ServerSettings_General_C]
MaxSelectedBricks=1000
MaxPlacedBricks=1000
SelectionTimeout=2.000000
PlaceTimeout=2.000000
ServerName=${config.server.name || ''}
ServerDescription=${config.server.description || ''}
ServerPassword=${config.server.password || ''}
MaxPlayers=${config.server.players || 20}
bPubliclyListed=${
      'publiclyListed' in config.server || config.server.publiclyListed
        ? 'True'
        : 'False'
    }
WelcomeMessage="${config.server.welcomeMessage || ''}"
bGlobalRulesetSelfDamage=True
bGlobalRulesetPhysicsDamage=False`
  );
}

export function read() {
  // TODO: Implement server config reading
}
