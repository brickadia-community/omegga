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
import { useStore } from '@nanostores/react';
import type { IStoreAutoRestartConfig } from '@omegga/webserver/backend/types';
import {
  IconCheck,
  IconCloudDownload,
  IconCloudSearch,
  IconDeviceFloppy,
  IconDownload,
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
  updateServer,
  useServerLiveness,
} from '../../stores/liveness';
import { $omeggaData } from '../../stores/user';

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
  const omeggaData = useStore($omeggaData);
  const [hasUpdate, setHasUpdate] = useState<boolean | null>(
    omeggaData?.update?.lastCheck ?? null,
  );
  useEffect(() => {
    setHasUpdate(omeggaData?.update?.lastCheck ?? null);
  }, [omeggaData?.update?.lastCheck]);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);

  const [savingWorld, setSavingWorld] = useState(false);

  useEffect(() => {
    rpcReq('server.autorestart.get').then(setConfig);
  }, []);

  const canUpdateCheck = omeggaData?.update?.canCheck ?? false;
  const checkForUpdate = useCallback(() => {
    if (!canUpdateCheck) return;
    setCheckingForUpdate(true);
    rpcReq('server.updatecheck').then(res => {
      setHasUpdate(res);
      setCheckingForUpdate(false);
    });
  }, [canUpdateCheck]);

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
      autoUpdateEnabled: config.autoUpdateEnabled ?? true,
      autoUpdateIntervalMins: Math.round(
        Math.max(10, Math.min(config.autoUpdateIntervalMins ?? 60, Infinity)),
      ),
    } satisfies IStoreAutoRestartConfig;
    rpcNotify('server.autorestart.set', blob);
  }, [config]);

  const saveWorld = async () => {
    setSavingWorld(true);
    await rpcReq('world.save');
    setSavingWorld(false);
  };

  const saved = useSaved(saveConfig);

  const changeConfig = <K extends keyof IStoreAutoRestartConfig>(name: K) => {
    return (value: IStoreAutoRestartConfig[K]) => {
      if (!config) return;
      setConfig(prev => ({
        ...prev!,
        [name]: value,
      }));
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
            <span style={{ flex: 1 }} />
            {omeggaData?.isSteam && canUpdateCheck !== null && (
              <Button
                main={Boolean(hasUpdate)}
                normal={!hasUpdate}
                data-tooltip="Check for updates"
                disabled={checkingForUpdate}
                onClick={checkForUpdate}
              >
                {hasUpdate === true ? (
                  <>
                    <IconDownload />
                    Update Available
                  </>
                ) : (
                  <>
                    <IconCloudSearch />
                    Check for Update
                  </>
                )}
              </Button>
            )}
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
            <Button
              info
              data-tooltip="Save the current world."
              disabled={starting || stopping || statusLoading || savingWorld}
              onClick={saveWorld}
            >
              <IconDeviceFloppy />
              Save World
            </Button>
            {omeggaData?.isSteam && (
              <Button
                normal={!hasUpdate}
                main={hasUpdate === true}
                data-tooltip={
                  'Stop and update the server even if there are no updates available.\n\nDoes not save the world or player locations.'
                }
                disabled={starting || stopping || statusLoading}
                onClick={() =>
                  prompt('update the server').then(ok => ok && updateServer())
                }
              >
                <IconCloudDownload />
                Update
              </Button>
            )}
          </div>
          <NavBar attached style={{ marginTop: 8 }}>
            Auto Restart
            <SavedSpan show={saved.status === SavedStatus.Waiting} />
          </NavBar>
          {config && (
            <div className="inputs-list">
              <div
                className="inputs-item"
                data-tooltip="When enabled on servers setup with SteamCMD, automatically updates the server when a new version is available"
              >
                <label>
                  Auto Update
                  {canUpdateCheck ? '' : ' (Feature requires SteamCMD)'}
                </label>
                <div className="inputs">
                  <Toggle
                    tooltip="Enabled"
                    value={config.autoUpdateEnabled}
                    onChange={changeConfig('autoUpdateEnabled')}
                  />
                  <Input
                    type="number"
                    placeholder="Minutes"
                    tooltip="Interval in minutes to check for updates (min 10)"
                    value={config.autoUpdateIntervalMins}
                    onChange={changeConfig('autoUpdateIntervalMins')}
                  />
                </div>
              </div>
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
