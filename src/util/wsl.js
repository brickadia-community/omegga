const { execSync } = require('child_process');
const path = require('path');

// run script that checks wsl version
const TOOL_PATH = path.join(__dirname, '../../tools/check_wsl.sh');
const out = execSync(TOOL_PATH, { shell: true }).toString();

// return 1 for wsl1, 2 for wsl2 and 0 for neither
module.exports = { WSL1: 1, WSL2: 2 }[out.trim()] ?? 0;
