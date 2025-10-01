import { IConfig } from '@config/types';
import fs from 'node:fs';
import path from 'node:path';

import * as file from '../util/file';

import { CONFIG_SAVED_DIR } from '@/softconfig';
const CONFIG_PATH = 'Config/LinuxServer';
const SERVER_SETTINGS = 'GameUserSettings.ini';

// Function that writes config
export function write(serverPath: string, config: IConfig) {
  const configPath = path.join(
    serverPath,
    config.server.savedDir ?? CONFIG_SAVED_DIR,
    CONFIG_PATH,
  );
  const settingsPath = path.join(configPath, SERVER_SETTINGS);

  file.mkdir(configPath);

  fs.writeFileSync(
    settingsPath,
    `[Server__BP_ServerSettings_General_C BP_ServerSettings_General_C]
ServerName=${config.server.name || ''}
ServerDescription=${config.server.description || ''}
ServerPassword=${config.server.password || ''}
MaxPlayers=${config.server.players || 20}
bPubliclyListed=${(config.server.publiclyListed ?? true) ? 'True' : 'False'}
WelcomeMessage="${config.server.welcomeMessage?.replace(/"/g, '\"').replace(/\\/g, '\\\\') || ''}"`,
  );

  /*
[Server__BP_ServerSettings_General_C BP_ServerSettings_General_C]
ServerTypeIndex2=1
ServerName=
ServerDescription=
ServerPassword=
MaxPlayers=30
bPubliclyListed=True
WelcomeMessage="<color=\"0055ff\">Welcome to <b>{2}</>, {1}.</><>a"
bGlobalRulesetSelfDamage=True
bGlobalRulesetPhysicsDamage=False
bGlobalRulesetEnableCameraBlockedEffects=False
UploadTimeout=5.000000
MaxPrefabBricks=1000
MaxPrefabComponents=20
MaxPrefabSize=(X=1000,Y=1000,Z=1000)
MaxPhysicsObjects=2000
MaxPhysicsObjectsPerUser=50
MaxPlacementBricks=2000
MaxPlacementEntities=10
bEnforceApplicatorLimits=False
TemplatePlacementTimeout=2.000000
MaxSelectionBoxSize=(X=1000,Y=1000,Z=1000)
MaxSelectedBricks=1000
SelectionTimeout=2.000000

[Server__BP_ServerSettingsAutoSave_C BP_ServerSettingsAutoSave_C]
bEnableAutoSave=True
bAnnounceAutoSave=True
AutoSaveInterval=300.000000
bIncludeScreenshot=False
  */
}

export function read() {
  // TODO: Implement server config reading
}
