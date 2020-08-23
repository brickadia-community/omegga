const readline = require('readline');
const colors = require('colors');

const { Omegga, config } = require('.');

const server = new Omegga('.', config.read('./config.yml'));

let logging = true;
server.on('line', l => logging && console.log('[out]'.blue, l));
server.on('debug', l => console.log('[dbg]'.green, l));
server.on('join', p => console.log(`${p.name.underline} joined.`.brightBlue));
server.on('leave', p => console.log(`${p.name.underline} left.`.brightBlue));
server.on('chat', (name, message) => console.log(`${name.brightYellow.underline}: ${message}`));
server.on('cmd:reload', name => {
  if(server.getPlayer(name).isHost()) {
    server.pluginLoader.unload();
    server.pluginLoader.scan();
    server.pluginLoader.reload();
    console.log('Loaded', server.pluginLoader.plugins.filter(p => p.isLoaded()).map(p => p.getName()));
  }
});
server.on('cmd:logs', name => {
  if(server.getPlayer(name).isHost()) {
    logging = !logging;
  }
});
server.on('chatcmd:pos', async (name, args) => {
  try {
    console.log(await server.getPlayer(name).getPosition());
    console.time('allPos');
    console.log(await server.getAllPlayerPositions());
    console.timeEnd('allPos');
  } catch (e) {
    console.error(e);
  }
});
server.on('chatcmd:status', async (name, args) => {
  try {
    console.time('serverstatus');
    console.log(JSON.stringify(await server.getServerStatus(), 0, 2));
    console.timeEnd('serverstatus');
  } catch (e) {
    console.error(e);
  }
});
server.on('chatcmd:mg', async (name, args) => {
  try {
    console.time('minigame');
    console.log(JSON.stringify(await server.getMinigames(), 0, 2));
    console.timeEnd('minigame');
  } catch (e) {
    console.error(e);
  }
});
server.on('chatcmd:setup', async (name, args) => {
  try {
    console.log(server.getRoleSetup());
    console.log(server.getRoleAssignments());
    console.log(server.getBanList());
    console.log(server.getNameCache());
  } catch (e) {
    console.error(e);
  }
});
server.on('chatcmd:role', async (name, args) => {
  try {
    const player = server.getPlayer(name);
    console.log(
      player.getPermissions(),
      player.getNameColor(),
      player.getRoles(),
    );
  } catch (e) {
    console.error(e);
  }
});
server.on('chatcmd:savedata', async (name, args) => {
  try {
    const data = await server.getSaveData();
    server.clearAllBricks();
    if (data)
      setTimeout(() => server.loadSaveData(data), 5000);
  } catch (e) {
    console.error(e);
  }
});

readline.createInterface({input: process.stdin, output: process.stdout, terminal: false})
  .on('line', line => {
    const [cmd, ...args] = line.split(' ');

    if (cmd === 'start')
      server.start();

    if (cmd === 'reload') {
      server.pluginLoader.unload();
      server.pluginLoader.scan();
      server.pluginLoader.reload();
      console.log('Loaded', server.pluginLoader.plugins.filter(p => p.isLoaded()).map(p => p.getName()));
    }

    if (cmd === 'stop')
      server.stop();

    if (cmd === 'exit')
      process.exit();

    if (cmd === 'cmd')
      server.writeln(args.join(' '));
  });
