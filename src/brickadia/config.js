const fs = require('fs');
const path = require('path');

const file = require('../util/file.js');

const CONFIG_PATH = 'Saved/Config/LinuxServer';
const SERVER_SETTINGS = '/ServerSettings.ini';

// Function that writes config
module.exports = {
  write(serverPath, config) {
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
        typeof config.server.publiclyListed === 'undefined' ||
        config.server.publiclyListed
          ? 'True'
          : 'False'
      }
WelcomeMessage="${config.server.welcomeMessage || ''}"
bGlobalRulesetSelfDamage=True
bGlobalRulesetPhysicsDamage=False`
    );
  },
  read() {
    // TODO: Implement server config reading
  },
};
