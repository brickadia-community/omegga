import Logger from '@/logger';
import { recordPluginError } from '@/metrics/errors';
import { type EnvironmentPreset } from '@brickadia/presets';
import Omegga from '@omegga/server';
import { type WriteSaveObject } from 'brs-js';
import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from 'json-rpc-2.0';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'readline';
import { Plugin } from './interface';
import { bootstrap } from './plugin_node_safe/proxyOmegga';

// TODO: check if version is compatible (v1 -> v2) from file
// TODO: write jsonrpc wrappers in a few languages, implement a few simple plugins
// TODO: languages: [ python, go ]

const MAIN_FILE = 'omegga_plugin';
const DOC_FILE = 'doc.json';
const PLUGIN_FILE = 'plugin.json';

export default class RpcPlugin extends Plugin {
  // undefined until load() spawns the child and after kill()
  #child: ChildProcessWithoutNullStreams | undefined;
  #rpc: JSONRPCServerAndClient;
  #errInterface: readline.Interface | undefined;
  #outInterface: readline.Interface | undefined;

  // path to the binary spawned when the plugin loads
  pluginFile: string;

  messageCounter: number;

  // all RPC plugins require a main (binary) file and a doc file
  static canLoad(pluginPath: string) {
    return (
      fs.existsSync(path.join(pluginPath, MAIN_FILE)) &&
      fs.existsSync(path.join(pluginPath, DOC_FILE))
    );
  }

  // websocket rpc plugin type
  static getFormat() {
    return 'jsonrpc_stdio';
  }

  // documentation is based on doc.json file
  getDocumentation() {
    return this.documentation;
  }
  constructor(pluginPath: string, omegga: Omegga) {
    super(pluginPath, omegga);

    this.messageCounter = 0;

    // TODO: validate documentation
    this.documentation = Plugin.readJSON(path.join(pluginPath, DOC_FILE));
    this.pluginConfig = Plugin.readJSON(path.join(pluginPath, PLUGIN_FILE));
    this.pluginFile = path.join(pluginPath, MAIN_FILE);

    this.eventPassthrough = this.eventPassthrough.bind(this);
    this.commands = [];

    this.#rpc = this.initRPC();
  }

  isLoaded() {
    return !!this.#child && !this.#child.exitCode;
  }

  // determing if a command is registered
  isCommand(cmd: string) {
    return this.commands.includes(cmd);
  }

  // spawn the plugin as a child process
  async load() {
    const name = this.getName();
    const verbose = (...msg: any[]) => Logger.verbose(name.underline, ...msg);
    verbose('Load method invoked');
    let frozen = true,
      timed = false;
    this.commands = [];

    // can't load the plugin if the child is still running
    if (this.#child) {
      verbose('Plugin already has child process');
      return false;
    }

    // plugins constructed without a server (CLI) cannot be loaded
    if (!this.omegga) return false;
    const omegga = this.omegga;

    let config;
    try {
      verbose('Getting plugin config');
      config = await this.storage.getConfig();
    } catch {
      return false;
    }

    try {
      if (this.pluginConfig?.emitConfig) {
        verbose('Emitting plugin config');
        await fs.promises.writeFile(
          path.join(this.path, this.pluginConfig.emitConfig),
          JSON.stringify(config),
        );
      }
      verbose('Spawning child process');
      this.#child = spawn(this.pluginFile);
      this.#child.stdin.setDefaultEncoding('utf8');
      this.#outInterface = readline.createInterface({
        input: this.#child.stdout,
        terminal: false,
      });
      this.#errInterface = readline.createInterface({
        input: this.#child.stderr,
        terminal: false,
      });
      this.attachListeners();
    } catch (err) {
      Logger.errorp(
        'error loading stdio rpc plugin',
        name.brightRed.underline,
        err,
      );
      await this.kill();
      this.emitStatus();
      return false;
    }

    return Promise.race([
      (async () => {
        try {
          // get some initial information to create an omegga proxy
          const initialData = bootstrap(omegga);

          verbose('Sending initial data');
          // send all of the mock events to the proxy omegga
          for (const ev in initialData) {
            // send some initial information
            this.notify(ev, initialData[ev]);
          }

          verbose('Initializing event passthrough');
          // pass events through
          omegga.on('*', this.eventPassthrough);

          try {
            // tell the plugin to start
            verbose('Waiting for plugin to start...');
            const result = await this.emit('init', config);

            verbose('Initialized with result:', result);
            // plugins can return a result object
            if (typeof result === 'object' && result) {
              // if registeredCommands is in the results, register the provided strings as commands
              const cmds = result.registeredCommands;
              if (
                cmds &&
                cmds instanceof Array &&
                cmds.every(i => typeof i === 'string')
              )
                this.commands = cmds;
            }
          } catch (e) {
            // messageless rejections are treated as a failed start; anything
            // with a message is logged and the plugin is considered started
            if (!(e && typeof e === 'object' && 'message' in e && e.message))
              return false;
            Logger.errorp(name.brightRed.underline, 'error starting: ', e);
          }

          // plugin is not frozen, resolve that it has loaded
          frozen = false;
          if (timed) return false;
          this.emitStatus();
          return true;
        } catch (e) {
          if (timed) return false;
          Logger.errorp(
            'error loading stdio rpc plugin',
            name.brightRed.underline,
            e,
          );
          await this.kill();
          frozen = false;
          this.emitStatus();
          return false;
        }
      })(),
      new Promise<boolean>(resolve => {
        // let user know if the child quit while launching
        this.#child?.once('exit', () => {
          if (!frozen || timed) return;
          verbose('Plugin exited during init');
          frozen = false;
          this.emitStatus();
          resolve(false);
        });

        // check if the child is frozen (while true)
        setTimeout(() => {
          if (!frozen) return;
          Logger.errorp(
            'I appear to be unresponsive when starting (maybe I forgot to respond to init)',
            name.brightRed.underline,
          );
          this.kill();
          timed = true;
          this.emitStatus();
          resolve(false);
        }, 5000);
      }),
    ]);
  }

  // kill the child process after requesting it to stop
  unload() {
    // an unloaded plugin stops exporting metrics rather than freezing its
    // last values into the scrape forever
    this.dropMetrics();
    if (!this.#child || this.#child.exitCode) {
      this.detachListeners();
      this.emitStatus();
      return Promise.resolve(true);
    }
    let frozen = true,
      timed = false;
    const name = this.getName();

    return Promise.race([
      (async (): Promise<boolean> => {
        try {
          // let the plugin know it's time to stop, if this error it's probably because the method was not implemented
          try {
            await this.emit('stop');
          } catch {
            // lazy developer - just implement stop please
          }

          await this.kill();

          frozen = false;
          if (timed) return false;
          this.emitStatus();
          this.commands = [];
          return true;
        } catch (e) {
          if (timed) return false;
          Logger.errorp(
            'error unloading rpc plugin',
            name.brightRed.underline,
            e,
          );
          frozen = false;
          this.emitStatus();
          return false;
        }
      })(),
      // this is wrapped in a promise for the freeze check
      new Promise<boolean>(resolve => {
        // check if the child is frozen (while true)
        setTimeout(() => {
          if (!frozen) return;
          Logger.errorp(
            'I appear to be unresponsive when stopping (maybe I forgot to respond to stop)',
            name.brightRed.underline,
          );
          this.kill();
          timed = true;
          this.emitStatus();
          resolve(true);
        }, 5000);
      }),
    ]);
  }

  // attaches event listeners
  attachListeners() {
    const name = this.getName();

    this.#outInterface?.on('line', line => {
      try {
        const rpcData = JSON.parse(line);
        try {
          this.#rpc.receiveAndSend(rpcData);
        } catch (e) {
          Logger.error(
            this.getName().brightRed.underline,
            '!>'.red,
            'error parsing rpc data',
            e,
            line,
          );
        }
      } catch {
        // fallback to logging
        Logger.log(name.underline, '>>'.green, line);
      }
    });

    // stderr - print out the errors
    this.#errInterface?.on('line', err => {
      Logger.error(name.brightRed.underline, '!>'.red, err);
    });

    this.#child?.on('error', () => this.kill());
    this.#child?.on('close', () => this.kill());
    this.#child?.on('exit', code => {
      if (code) recordPluginError(name);
      Logger.errorp(
        '!>'.red,
        'rpc plugin',
        name.brightRed.underline,
        'exited with code',
        code,
      );
      this.kill();
    });
  }

  // removes previously attached event listeners
  detachListeners() {
    this.#outInterface?.removeAllListeners('line');
    this.#errInterface?.removeAllListeners('line');
    if (this.#child) {
      this.#child.removeAllListeners('exit');
      this.#child.removeAllListeners('close');
      this.#child.removeAllListeners('error');
    }
  }

  // write a string to the child process
  writeln(line: string) {
    try {
      if (this.#child && !this.#child.exitCode)
        this.#child.stdin.write(line + '\n');
    } catch {
      // the child probably died... oops!
    }
  }

  // forcibly kills the plugin
  async kill() {
    this.#rpc.rejectAllPendingRequests('Plugin Terminated');
    this.detachListeners();
    this.omegga?.off('*', this.eventPassthrough);
    // kill() is the crash path as well as the unload path; a dead plugin's
    // last metric snapshot must not keep being scraped as if it were live
    this.dropMetrics();
    const child = this.#child;
    if (!child) return;

    // create a promise for the exit of the process
    const promise = new Promise(resolve => child.once('exit', resolve));

    // kill the process
    child.kill('SIGINT');

    // ...kill it again just to make sure it's dead
    spawn('kill', ['-9', `${child.pid}`]);

    // wait for the process to exit
    await promise;
    this.#child = undefined;
    this.emitStatus();
  }

  eventPassthrough(type: string, ...args: any[]) {
    if (!this.#child) return;
    this.notify(type, args);
  }

  // setup the JSONRPC communication
  initRPC(): JSONRPCServerAndClient {
    const server = new JSONRPCServer();
    const client = new JSONRPCClient(req => {
      try {
        this.writeln(JSON.stringify(req));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    });
    const rpc = new JSONRPCServerAndClient(server, client);

    // plugin log generator function
    const ezLog =
      (
        logFn: 'log' | 'error' | 'info' | 'debug' | 'warn' | 'trace',
        name: string,
        symbol: string,
      ) =>
      (line: any) =>
        console[logFn](name.underline, symbol, line);

    const name = this.getName();

    // server can output logs special formatting for stdout
    rpc.addMethod('log', ezLog('log', name, '>>'.green));
    rpc.addMethod('error', ezLog('error', name.brightRed, '!>'.red));
    rpc.addMethod('info', ezLog('info', name, '#>'.blue));
    rpc.addMethod('debug', ezLog('debug', name, '?>'.blue));
    rpc.addMethod('warn', ezLog('warn', name.brightYellow, ':>'.yellow));
    rpc.addMethod('trace', ezLog('trace', name, 'T>'.grey));

    // plugin store interactions
    rpc.addMethod('store.get', key =>
      this.storage.get(key as unknown as string),
    );
    rpc.addMethod('store.set', ([key, value]: [key: string, value: any]) =>
      this.storage.set(key, value),
    );
    rpc.addMethod('store.delete', key =>
      this.storage.delete(key as unknown as string),
    );
    rpc.addMethod('store.wipe', () => this.storage.wipe());
    rpc.addMethod('store.count', () => this.storage.count());
    rpc.addMethod('store.keys', () => this.storage.keys());

    // metric snapshots. an rpc plugin pushes its whole metric state whenever it
    // likes (a timer is the usual choice) and the host replaces what it holds.
    // the payload comes from another process, so it is re-validated and
    // re-capped here rather than trusted
    rpc.addMethod('metrics', families => {
      this.omegga?.metrics?.plugins.setSnapshot(this.getName(), families);
      return 'ok';
    });

    // server can run console commands
    rpc.addMethod('exec', line =>
      this.server.writeln(line as unknown as string),
    );
    rpc.addMethod('writeln', line =>
      this.server.writeln(line as unknown as string),
    );
    rpc.addMethod('broadcast', line =>
      this.server.broadcast(line as unknown as string),
    );
    rpc.addMethod(
      'whisper',
      ({ target, line }: { target: string; line: string }) =>
        this.server.whisper(target, line),
    );
    rpc.addMethod(
      'middlePrint',
      ({ target, line }: { target: string; line: string }) =>
        this.server.middlePrint(target, line),
    );
    rpc.addMethod('getPlayers', () => this.server.getPlayers());
    rpc.addMethod('getPlayerPosition', name =>
      this.server.getPlayer(name as unknown as string)?.getPosition(),
    ); // included for compatibility
    rpc.addMethod('getAllPlayerPositions', () =>
      this.server.getAllPlayerPositions(),
    );
    rpc.addMethod('getEnvironmentPresets', () =>
      this.server.getEnvironmentPresets(),
    );
    rpc.addMethod('resetEnvironment', () => this.server.resetEnvironment());
    rpc.addMethod('saveEnvironment', name =>
      this.server.saveEnvironment(name as unknown as string),
    );
    rpc.addMethod('loadEnvironment', name =>
      this.server.loadEnvironment(name as unknown as string),
    );
    rpc.addMethod('loadEnvironmentData', data =>
      this.server.loadEnvironmentData(data as EnvironmentPreset),
    );
    rpc.addMethod('getServerStatus', () => this.server.getServerStatus());
    rpc.addMethod('getMinigames', () => this.server.getMinigames());
    rpc.addMethod('getMinigamePresets', () => this.server.getMinigamePresets());
    rpc.addMethod(
      'saveMinigame',
      ({ index, name }: { index: number; name: string }) =>
        this.server.saveMinigame(index, name),
    );
    rpc.addMethod(
      'loadMinigame',
      ({ name, owner }: { name: string; owner: string }) =>
        this.server.loadMinigame(name, owner),
    );
    rpc.addMethod('nextRoundMinigame', index =>
      this.server.nextRoundMinigame(index as unknown as number),
    );
    rpc.addMethod('resetMinigame', index =>
      this.server.resetMinigame(index as unknown as number),
    );
    rpc.addMethod('deleteMinigame', index =>
      this.server.deleteMinigame(index as unknown as number),
    );
    rpc.addMethod('listMinigames', () => this.server.listMinigames());
    rpc.addMethod('getHostId', () => this.server.getHostId());
    rpc.addMethod('getRoleSetup', () => this.server.getRoleSetup());
    rpc.addMethod('getBanList', () => this.server.getBanList());
    rpc.addMethod('getSaves', () => this.server.getSaves());
    rpc.addMethod('getSavePath', name =>
      this.server.getSavePath(name as unknown as string),
    );
    rpc.addMethod('getPrefabs', () => this.server.getPrefabs());
    rpc.addMethod('getPrefabPath', name =>
      this.server.getPrefabPath(name as unknown as string),
    );
    rpc.addMethod(
      'loadPrefab',
      ({
        path,
        ...options
      }: {
        path: string;
        offX?: number;
        offY?: number;
        offZ?: number;
        atOriginalPosition?: boolean;
        orientation?: number;
        rootEntityPersistentIndex?: number;
        mirrorAxes?: number;
        overrideUserId?: string;
      }) => this.server.loadPrefab(path, options),
    );
    rpc.addMethod(
      'savePrefab',
      ({
        path,
        ...options
      }: {
        path: string;
        region?: {
          center: [number, number, number];
          extent: [number, number, number];
        };
        entities?: boolean;
        rootEntityPersistentIndex?: number;
        userId?: string;
      }) => this.server.savePrefab(path, options),
    );
    rpc.addMethod(
      'savePrefabAsync',
      ({
        path,
        ...options
      }: {
        path: string;
        region?: {
          center: [number, number, number];
          extent: [number, number, number];
        };
        entities?: boolean;
        rootEntityPersistentIndex?: number;
        userId?: string;
      }) => this.server.savePrefabAsync(path, options),
    );
    rpc.addMethod(
      'givePrefabToPlayer',
      ({
        path,
        player,
        preserveOwnership = false,
      }: {
        path: string;
        player: string;
        preserveOwnership?: boolean;
      }) => this.server.givePrefabToPlayer(path, player, { preserveOwnership }),
    );
    rpc.addMethod(
      'loadPrefabOnPlayer',
      ({
        path,
        player,
        preserveOwnership = false,
      }: {
        path: string;
        player: string;
        preserveOwnership?: boolean;
      }) => this.server.loadPrefabOnPlayer(path, player, { preserveOwnership }),
    );
    rpc.addMethod(
      'clearBricks',
      ({ target, quiet = false }: { target: string; quiet?: boolean }) =>
        this.server.clearBricks(target, quiet),
    );
    rpc.addMethod('clearAllBricks', quiet =>
      this.server.clearAllBricks(quiet as unknown as boolean),
    );
    rpc.addMethod('saveBricks', name =>
      this.server.saveBricks(name as unknown as string),
    );
    rpc.addMethod(
      'loadBricks',
      ({
        name,
        offX = 0,
        offY = 0,
        offZ = 0,
        quiet = false,
      }: {
        name: string;
        offX?: number;
        offY?: number;
        offZ?: number;
        quiet?: boolean;
      }) => this.server.loadBricks(name, { offX, offY, offZ, quiet }),
    );
    rpc.addMethod(
      'loadBricksOnPlayer',
      ({
        name,
        player,
        offX = 0,
        offY = 0,
        offZ = 0,
      }: {
        name: string;
        player: string;
        offX?: number;
        offY?: number;
        offZ?: number;
        quiet?: boolean;
      }) => this.server.loadBricksOnPlayer(name, player, { offX, offY, offZ }),
    );
    rpc.addMethod('readSaveData', name =>
      this.server.readSaveData(name as unknown as string),
    );
    rpc.addMethod('getSaveData', () => this.server.getSaveData());
    rpc.addMethod(
      'loadSaveData',
      ({
        data,
        offX = 0,
        offY = 0,
        offZ = 0,
        quiet = false,
      }: {
        data: WriteSaveObject;
        offX?: number;
        offY?: number;
        offZ?: number;
        quiet?: boolean;
      }) => this.server.loadSaveData(data, { offX, offY, offZ, quiet }),
    );
    rpc.addMethod(
      'loadSaveDataOnPlayer',
      ({
        data,
        player,
        offX = 0,
        offY = 0,
        offZ = 0,
      }: {
        data: WriteSaveObject;
        player: string;
        offX?: number;
        offY?: number;
        offZ?: number;
        quiet?: boolean;
      }) =>
        this.server.loadSaveDataOnPlayer(data, player, { offX, offY, offZ }),
    );
    rpc.addMethod('changeMap', map =>
      this.server.changeMap(map as unknown as string),
    );
    rpc.addMethod('unload', () => this.unload());
    rpc.addMethod('reload', async () => {
      await this.unload();
      await this.load();
    });

    // player related operations
    const addPlayerMethod = (name: string) =>
      rpc.addMethod(`player.${name}`, player =>
        (this.server.getPlayer(player as unknown as string) as any)?.[name](),
      );
    rpc.addMethod('player.get', target => {
      const player = this.server.getPlayer(target as unknown as string);
      return player && { ...player, host: player.isHost() };
    });
    addPlayerMethod('getRoles');
    addPlayerMethod('getPermissions');
    addPlayerMethod('getNameColor');
    addPlayerMethod('getPosition');
    addPlayerMethod('getPawn');
    addPlayerMethod('getGhostBrick');
    addPlayerMethod('getPaint');
    addPlayerMethod('isCrouched');
    addPlayerMethod('isDead');
    addPlayerMethod('getTemplateBounds');
    addPlayerMethod('getTemplateBoundsData');
    addPlayerMethod('kill');
    addPlayerMethod('getScore');
    addPlayerMethod('getLeaderboard');
    rpc.addMethod(
      'player.loadDataAtGhostBrick',
      ({
        target,
        data,
        rotate = true,
        offX = 0,
        offY = 0,
        offZ = 0,
        quiet = false,
      }: {
        target: string;
        data: WriteSaveObject;
        rotate?: boolean;
        offX?: number;
        offY?: number;
        offZ?: number;
        quiet?: boolean;
      }) =>
        this.server
          .getPlayer(target)
          ?.loadDataAtGhostBrick(data, { rotate, offX, offY, offZ, quiet }),
    );
    rpc.addMethod(
      'player.loadSaveData',
      ({
        target,
        data,
        offX = 0,
        offY = 0,
        offZ = 0,
      }: {
        target: string;
        data: WriteSaveObject;
        offX?: number;
        offY?: number;
        offZ?: number;
      }) =>
        this.server.getPlayer(target)?.loadSaveData(data, { offX, offY, offZ }),
    );
    rpc.addMethod(
      'player.clearBricks',
      ({ target, quiet = false }: { target: string; quiet?: boolean }) =>
        this.server.getPlayer(target)?.clearBricks(quiet),
    );
    rpc.addMethod(
      'player.loadBricks',
      ({ target, saveName }: { target: string; saveName: string }) =>
        this.server.getPlayer(target)?.loadBricks(saveName),
    );
    rpc.addMethod(
      'player.damage',
      ({ target, amount }: { target: string; amount: number }) =>
        this.server.getPlayer(target)?.damage(amount),
    );
    rpc.addMethod(
      'player.heal',
      ({ target, amount }: { target: string; amount: number }) =>
        this.server.getPlayer(target)?.heal(amount),
    );
    rpc.addMethod(
      'player.giveItem',
      ({ target, item }: { target: string; item: string }) =>
        this.server.getPlayer(target)?.giveItem(item as any),
    );
    rpc.addMethod(
      'player.takeItem',
      ({ target, item }: { target: string; item: string }) =>
        this.server.getPlayer(target)?.takeItem(item as any),
    );
    rpc.addMethod(
      'player.setTeam',
      ({ target, teamIndex }: { target: string; teamIndex: number }) =>
        this.server.getPlayer(target)?.setTeam(teamIndex),
    );
    rpc.addMethod(
      'player.setMinigame',
      ({ target, index }: { target: string; index: number }) =>
        this.server.getPlayer(target)?.setMinigame(index),
    );
    rpc.addMethod(
      'player.setScore',
      ({
        target,
        minigameIndex,
        score,
      }: {
        target: string;
        minigameIndex: number;
        score: number;
      }) => this.server.getPlayer(target)?.setScore(minigameIndex, score),
    );
    rpc.addMethod(
      'player.setLeaderboard',
      ({
        target,
        key,
        value,
      }: {
        target: string;
        key: string;
        value: number;
      }) => this.server.getPlayer(target)?.setLeaderboard(key, value),
    );

    // plugin related operations
    rpc.addMethod('plugin.get', async name => {
      const plugin = this.server.pluginLoader?.plugins.find(
        p => p.getName() === (name as unknown as string),
      );

      if (plugin) {
        return {
          name,
          documentation: plugin.getDocumentation(),
          loaded: plugin.isLoaded(),
        };
      } else {
        return null;
      }
    });

    rpc.addMethod(
      'plugin.emit',
      async ([name, event, ...args]: [string, string, ...any[]]) => {
        const plugin = this.server.pluginLoader?.plugins.find(
          p => p.getName() === name,
        );

        if (plugin) {
          return plugin.emitPlugin(event, this.getName(), args);
        } else {
          return null;
        }
      },
    );

    return rpc;
  }

  // emit a custom plugin event
  async emitPlugin(event: string, from: string, args: any[]) {
    return await this.emit('plugin:emit', [event, from, ...args]);
  }

  // emit a message to the plugin via the jsonrpc client and expect a response
  emit(type: string, arg?: any) {
    return this.#rpc.request(type, arg);
  }

  // emit a message to the plugin via the jsonrpc client, don't expect a response
  notify(type: string, arg?: any) {
    try {
      this.#rpc.notify(type, arg);
    } catch {
      // this only happens if the RPC library is hitting some issues - probably redundant
    }
  }
}
