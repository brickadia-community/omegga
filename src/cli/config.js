// TODO: convert the config view into a promise, resolve with config, reject with close
// TODO: convert config view into a contained blessed component
const blessed = require('blessed');
const contrib = require('blessed-contrib');

const screen = blessed.screen({
  smartCSR: true,
  title: 'omegga config',
});

const grid = new contrib.grid({rows: 1, cols: 2, screen: screen});

const boxStyle = {
  bg: 'black',
  scrollbar: {
    bg: 'grey',
  },
}

const serverCfgBox = grid.set(0, 0, 1, 1, blessed.box, {label: 'Server Configuration', keys: true});
const pluginCfgBox = grid.set(0, 1, 1, 1, blessed.box, {label: 'Plugin Configuration', keys: true});

const serverCfgForm = blessed.form({
  parent: serverCfgBox,
  keys: true,
  vi: true,
  mouse: true,
  scrollable: true,
  scrollbar: true,
  style: {...boxStyle},
});

// TODO: read config and populate with default values
const fields = [{
  type: 'note',
  label: 'Esc to stop editing, Ctrl-s to save, Ctrl-x to close',
}, {
  type: 'divider',
  label: 'Credentials'
}, {
  type: 'input',
  name: 'userEmail',
  label: 'Host Email',
}, {
  type: 'input',
  name: 'userPassword',
  label: 'Host Password',
  censor: true,
}, {
  type: 'note',
  label: 'Password will be deleted after first start',
}, {
  type: 'divider',
  label: 'Server',
}, {
  type: 'input',
  name: 'serverName',
  label: 'Server Name',
}, {
  type: 'input',
  name: 'port',
  label: 'Server Port (UDP)',
  value: '7777',
}, {
  type: 'input',
  name: 'serverPassword',
  label: 'Server Password',
}, {
  type: 'input',
  name: 'serverDescription',
  label: 'Server Description',
  height: 2,
}, {
  type: 'input',
  name: 'serverMotd',
  label: 'Welcome Message',
}, {
  type: 'input',
  name: 'players',
  label: 'Max Players',
  value: '20',
}, {
  type: 'checkbox',
  name: 'public',
  checked: true,
  label: 'Publicly Listed',
}];

const inputStyle = {
  bg: 'blue',
  focus: {
    bg: 'magenta',
  },
};

let i = 1;
for (const field of fields) {
  field.hover = null;
  switch (field.type) {
  case 'divider':
    blessed.line({
      parent: serverCfgForm,
      left: 1,
      right: 1,
      top: i,
      orientation: 'horizontal',
    });
    blessed.text({
      parent: serverCfgForm,
      left: '50%-' + (1+Math.floor(field.label.length/2)),
      width: field.label.length + 2,
      content: ' ' + field.label,
      top: i,
    });

    i += 2;

    break;

  case 'note':
    blessed.text({
      parent: serverCfgForm,
      left: 1,
      width: 5,
      content: 'Note:',
      style: {
        bold: true,
        underline: true,
      },
      top: i,
    });
    blessed.text({
      parent: serverCfgForm,
      left: 7,
      content: field.label,
      top: i,
    });

    i += 2;

    break;

  case 'input':
    blessed.text({
      parent: serverCfgForm,
      left: 1,
      top: i,
      style: {
        fg: 'white',
        bold: true
      },
      height: 1,
      content: field.label,
    })

    const height = (field.height || 1);
    const input = blessed[field.height ? 'textarea' : 'textbox']({
      parent: serverCfgForm,
      left: 4,
      right: 1,
      name: field.name,
      inputOnFocus: true,
      value: field.value,
      top: i + 1,
      censor: !!field.censor,
      height,
      style: {...inputStyle},
    });

    i += height + 2;
    break;

  case 'checkbox':
    blessed.text({
      parent: serverCfgForm,
      left: 5,
      top: i,
      style: {
        fg: 'white',
        bold: true
      },
      height: 1,
      content: field.label,
    })

    const checkbox = blessed.checkbox({
      parent: serverCfgForm,
      name: field.name,
      checked: field.checked,
      left: 1,
      width: 4,
      height: 1,
      inputOnFocus: true,
      top: i,
    });

    i += 2;
    break;
  }
}

serverCfgForm.on('submit', data => {
  const cfg = {
    credentials: {
      email: data.userEmail,
      password: data.userPassword,
    },
    server: {
      name: data.serverName,
      port: Number(data.port),
      password: data.serverPassword,
      description: data.serverDescription,
      welcomeMessage: data.serverMotd,
      publiclyListed: data.public,
      players: Number(data.players),
    },
  };
  try {
    // TODO: validate config and show errors before writing to file
    // TODO: write roles to file
    // write config to yml file
    require('../config').write('./config.yml', cfg);
    // write config to ini file
    require('../brickadia/config.js').write(require('../softconfig.js').BRICKADIA_PATH, cfg);
    screen.destroy();
  } catch (e) {
    // TODO: do something with the error (probably validation)
    screen.render();
  }
});

serverCfgForm.focus();

screen.key(['C-c', 'C-x', 'q'], () => {
  screen.destroy();
  process.exit(0);
});

screen.key(['C-s', 'w'], () => {
  serverCfgForm.submit();
});

// TODO: implement plugin config
pluginCfgBox.setContent('to be implemented');

screen.render();