import {
  Button,
  Dimmer,
  Footer,
  Header,
  Input,
  Modal,
  NavBar,
  NavHeader,
  PageContent,
  PopoutContent,
  SideNav,
  Toggle,
} from '@components';
import { SavedSpan, SavedStatus, useSaved } from '@hooks';
import type { IStoreAutoRestartConfig } from '@omegga/webserver/backend/types';
import {
  IconCheck,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { rpcNotify, rpcReq } from '../../socket';
import {
  restartServer,
  startServer,
  stopServer,
  useServerLiveness,
} from '../../stores/liveness';

export const ServerView = () => {
  const {
    started,
    stopping,
    starting,
    loading: statusLoading,
  } = useServerLiveness();
  const [confirm, setConfim] = useState({
    show: false,
    message: '',
    resolve: (_val: boolean) => {},
  });
  const prompt = useCallback(
    (message: string) =>
      new Promise(resolve => {
        setConfim({
          message,
          show: true,
          resolve(val) {
            resolve(val);
            setConfim({ show: false, message: '', resolve: () => {} });
          },
        });
      }),
    [],
  );

  const [config, setConfig] = useState<IStoreAutoRestartConfig | null>(null);

  useEffect(() => {
    rpcReq('server.autorestart.get').then(setConfig);
  }, []);

  const saveConfig = useCallback(async () => {
    if (!config) return;

    const blob = {
      type: 'autoRestartConfig',
      maxUptime: Math.round(Math.max(1, Math.min(config.maxUptime, 168))),
      maxUptimeEnabled: config.maxUptimeEnabled,
      emptyUptime: Math.round(Math.max(1, Math.min(config.emptyUptime, 168))),
      emptyUptimeEnabled: config.emptyUptimeEnabled,
      dailyHour: Math.round(Math.max(0, Math.min(config.dailyHour, 23))),
      dailyHourEnabled: config.dailyHourEnabled,
      announcementEnabled: config.announcementEnabled,
      playersEnabled: config.playersEnabled,
      saveWorld: config.saveWorld,
    };
    rpcNotify('server.autorestart.set', blob);
  }, [config]);

  const saved = useSaved(saveConfig);

  const changeConfig = <K extends keyof IStoreAutoRestartConfig>(name: K) => {
    return (value: IStoreAutoRestartConfig[K]) => {
      if (!config) return;
      config[name] = value;
      saved.fire();
    };
  };

  return (
    <>
      <NavHeader title="Server" />
      <PageContent>
        <SideNav />
        <div className="generic-container server-container">
          <NavBar>
            Server Status:{' '}
            {starting
              ? 'starting'
              : stopping
                ? 'stopping'
                : started
                  ? 'started'
                  : 'stopped'}
          </NavBar>
          <div className="buttons">
            <Button
              main
              data-tooltip="Start the server"
              disabled={starting || stopping || statusLoading || started}
              onClick={() =>
                prompt('start the server').then(ok => ok && startServer())
              }
            >
              <IconPlayerPlay />
              Start
            </Button>
            <Button
              error
              data-tooltip="Stop the server"
              disabled={starting || stopping || statusLoading || !started}
              onClick={() =>
                prompt('stop the server').then(ok => ok && stopServer())
              }
            >
              <IconPlayerStop />
              Stop
            </Button>
            <Button
              warn
              data-tooltip="Reloads the server's world. Saves minigames/environment/bricks if 'Save World' is enabled below."
              disabled={starting || stopping || statusLoading}
              onClick={() =>
                prompt('restart the server').then(ok => ok && restartServer())
              }
            >
              <IconRefresh />
              Restart
            </Button>
          </div>
          <NavBar attached style={{ marginTop: 8 }}>
            Auto Restart
            <SavedSpan show={saved.status === SavedStatus.Waiting} />
          </NavBar>
          {config && (
            <div className="inputs-list">
              <div
                className="inputs-item"
                data-tooltip="How many hours before restarting regardless of online players"
              >
                <label>Max Server Uptime (Hours)</label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.maxUptimeEnabled}
                    onChange={changeConfig('maxUptimeEnabled')}
                  />
                  <Input
                    type="number"
                    placeholder="Hours"
                    tooltip="Uptime Hours"
                    value={config.maxUptime}
                    onChange={changeConfig('maxUptime')}
                  />
                </div>
              </div>
              <div
                className="inputs-item"
                data-tooltip="How many hours before restarting when no players are online"
              >
                <label>Empty Server Lifetime (Hours)</label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.emptyUptimeEnabled}
                    onChange={changeConfig('emptyUptimeEnabled')}
                  />
                  <Input
                    type="number"
                    placeholder="Hours"
                    tooltip="Uptime Hours"
                    value={config.emptyUptime}
                    onChange={changeConfig('emptyUptime')}
                  />
                </div>
              </div>
              <div
                className="inputs-item"
                data-tooltip="Restart every day at a certain hour"
              >
                <label>Daily at a Specific Hour</label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.dailyHourEnabled}
                    onChange={changeConfig('dailyHourEnabled')}
                  />
                  <Input
                    type="number"
                    placeholder="Hour"
                    tooltip="Hour (0 = 12am, 13 = 1pm)"
                    value={config.dailyHour}
                    onChange={changeConfig('dailyHour')}
                  />
                </div>
              </div>
              <div
                className="inputs-item"
                data-tooltip="When enabled, announces auto restart"
              >
                <label>Restart Announcement</label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.announcementEnabled}
                    onChange={changeConfig('announcementEnabled')}
                  />
                </div>
              </div>
              <div
                className="inputs-item"
                data-tooltip="When enabled, reconnects players at their previous positions"
              >
                <label>Reload Players</label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.playersEnabled}
                    onChange={changeConfig('playersEnabled')}
                  />
                </div>
              </div>
              <div
                className="inputs-item"
                data-tooltip="When enabled, saves the current world. The default world will be loaded on restart"
              >
                <label>Save World</label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.saveWorld ?? true}
                    onChange={changeConfig('saveWorld')}
                  />
                </div>
              </div>
            </div>
          )}
          <Dimmer visible={confirm.show}>
            <Modal visible>
              <Header> Confirmation </Header>
              <PopoutContent>
                <p>Are you sure you want to {confirm.message}?</p>
              </PopoutContent>
              <Footer>
                <Button main onClick={() => confirm.resolve(true)}>
                  <IconCheck />
                  Yes
                </Button>
                <div style={{ flex: 1 }} />
                <Button normal onClick={() => confirm.resolve(false)}>
                  <IconX />
                  No
                </Button>
              </Footer>
            </Modal>
          </Dimmer>
        </div>
      </PageContent>
    </>
  );
};
