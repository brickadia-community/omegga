import type { IPluginCommand, IPluginDocumentation } from '@/plugin';
import {
  Button,
  Dropdown,
  Footer,
  Input,
  ListInput,
  Loader,
  PlayerDropdown,
  RoleDropdown,
  Scroll,
  Toggle,
} from '@components';
import {
  IconArrowBackUp,
  IconCheck,
  IconMinus,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react';
import { debounce } from '@utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { trpc } from '../../trpc';
const jsonEq = (a: any, b: any) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
};

export const PluginInspector = () => {
  const [_location, params] = useRoute('/plugins/:id');
  const [plugin, setPlugin] = useState<any | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(Boolean(plugin?.path));
  const [waiting, setWaiting] = useState(false);
  const [showSave, setShowSave] = useState<Record<string, boolean>>({});

  const getQuery = trpc.plugin.get.useQuery(
    { shortPath: params?.id ?? '' },
    { enabled: !!params?.id },
  );

  useEffect(() => {
    if (getQuery.data) {
      setPlugin(getQuery.data);
      setConfig(getQuery.data.config);
      setLoading(false);
    } else if (getQuery.isError) {
      setLoading(false);
    }
  }, [getQuery.data, getQuery.isError]);

  const loadMutation = trpc.plugin.load.useMutation();
  const unloadMutation = trpc.plugin.unload.useMutation();
  const toggleMutation = trpc.plugin.toggle.useMutation();
  const configMutation = trpc.plugin.config.useMutation();

  const loadPlugin = async () => {
    if (!params?.id) return;
    setWaiting(true);
    await loadMutation.mutateAsync({ shortPath: params.id });
    await getQuery.refetch();
    setWaiting(false);
  };
  const unloadPlugin = async () => {
    if (!params?.id) return;
    setWaiting(true);
    await unloadMutation.mutateAsync({ shortPath: params.id });
    await getQuery.refetch();
    setWaiting(false);
  };
  const reloadPlugin = async () => {
    if (!params?.id) return;
    setWaiting(true);
    const ok = await unloadMutation.mutateAsync({ shortPath: params.id });
    if (ok) {
      await loadMutation.mutateAsync({ shortPath: params.id });
    }
    await getQuery.refetch();
    setWaiting(false);
  };
  const togglePlugin = async (enabled: boolean) => {
    if (!params?.id) return;
    setWaiting(true);
    await toggleMutation.mutateAsync({ shortPath: params.id, enabled });
    await getQuery.refetch();
    setWaiting(false);
  };

  const configRef = useRef(config);
  configRef.current = config;
  const pluginRef = useRef(plugin);
  pluginRef.current = plugin;

  trpc.plugin.onStatus.useSubscription(undefined, {
    onData(data) {
      if (data.shortPath !== pluginRef.current?.path) return;
      setPlugin((prev: any) => ({ ...prev!, ...data }));
    },
  });

  const saveConfig = useMemo(
    () =>
      debounce(async () => {
        if (!params?.id || !pluginRef.current) return;

        const diff: Record<string, boolean> = {};
        const config = configRef.current;
        const pluginPath = pluginRef.current.path;
        for (const c in pluginRef.current?.config ?? {}) {
          if (pluginRef.current?.config[c] != config[c]) {
            diff[c] = true;
          }
          const ok = await configMutation.mutateAsync({
            shortPath: params?.id,
            config,
          });
          if (ok) {
            setShowSave(diff);
            setTimeout(() => {
              setShowSave({});
              setPlugin((p: any) =>
                p?.path === pluginPath ? { ...p, config } : p,
              );
            });
          }
        }
      }, 500),
    [params?.id],
  );

  const updateConfig = (key: string, value: any) => {
    if (!plugin || !config) return;
    setConfig(prev => ({ ...prev, [key]: value }));
    saveConfig();
  };

  return (
    <div className="plugin-view">
      <Loader active={loading} size="huge">
        Loading Plugin
      </Loader>
      <div className="plugin-info">
        {!loading && plugin && (
          <Scroll>
            <div className="stats">
              <div className="stat">
                <b data-tooltip="Plugin name">Name:</b> {plugin.name}
              </div>
              <div className="stat">
                <b data-tooltip="Plugin creator">Author:</b>{' '}
                {plugin.documentation?.author ?? 'unknown'}
              </div>
              <div className="stat">
                <b>Description:</b>{' '}
                {plugin.documentation?.description ?? 'none'}
              </div>
              <div className="stat">
                <b data-tooltip="The folder this plugin runs in">Folder:</b>{' '}
                {plugin.path}
              </div>
              <div className="stat">
                <b data-tooltip="The type of plugin this is">Format:</b>{' '}
                {plugin.format}
              </div>
              <div className="stat">
                <b data-tooltip="Number of objects in the plugin's storage">
                  Stored Objects:
                </b>{' '}
                {plugin.objCount}
              </div>
              <div className="stat">
                <b data-tooltip="Plugin can be started">Enabled:</b>{' '}
                {plugin.isEnabled ? 'Yes' : 'No'}
              </div>
              <div className="stat">
                <b data-tooltip="Plugin is running">Loaded:</b>{' '}
                {plugin.isLoaded ? 'Yes' : 'No'}
              </div>
            </div>
            <div
              className="section-header"
              data-tooltip="Ways to configure the plugin. Changes take place the next time a plugin is loaded."
            >
              Configs
            </div>
            <div className="option-list">
              {Object.keys(plugin.documentation.config ?? {}).length === 0 && (
                <div className="option-item">
                  <i className="option-name">None</i>
                </div>
              )}
              {Object.entries(
                (plugin.documentation.config ??
                  {}) as IPluginDocumentation['config'],
              ).map(([c, conf]) => (
                <div className="option-item config" key={c}>
                  <div className="option-input">
                    <div
                      className="option-label"
                      data-tooltip={conf.description}
                    >
                      {c}
                      <span
                        className={`saved-note ${showSave[c] ? 'show' : ''}`}
                      >
                        SAVED <IconCheck size="20" />
                      </span>
                    </div>
                    <div className="option-value">
                      {['string', 'password', 'number'].includes(conf.type) && (
                        <Input
                          type={
                            conf.type === 'string'
                              ? 'text'
                              : (conf.type as 'password' | 'number')
                          }
                          value={config[c] as string | number}
                          onChange={value => updateConfig(c, value)}
                        />
                      )}
                      {conf.type === 'list' && (
                        <ListInput
                          options={'options' in conf ? conf.options : undefined}
                          type={conf.itemType}
                          value={config[c] as (string | number)[]}
                          onChange={value => updateConfig(c, value)}
                        />
                      )}
                      {conf.type === 'players' && (
                        <PlayerDropdown
                          value={config[c] as { id: string; name: string }[]}
                          onChange={value => updateConfig(c, value)}
                        />
                      )}
                      {conf.type === 'role' && (
                        <RoleDropdown
                          value={config[c] as string}
                          onChange={value => updateConfig(c, value)}
                        />
                      )}
                      {conf.type === 'enum' && (
                        <Dropdown
                          options={conf.options}
                          value={config[c] as string}
                          onChange={value => updateConfig(c, value)}
                        />
                      )}
                      {conf.type === 'boolean' && (
                        <Toggle
                          value={config[c] as boolean}
                          onChange={value => updateConfig(c, value)}
                        />
                      )}
                      {!jsonEq(conf.default, config[c]) && (
                        <IconArrowBackUp
                          onClick={() => updateConfig(c, conf.default)}
                          className="reset-button"
                          data-tooltip="Reset to default value"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="section-header"
              data-tooltip="Ways to control the plugin"
            >
              Commands
            </div>
            <div className="option-list">
              {(plugin.documentation.commands ?? []).length === 0 && (
                <div className="option-item">
                  <i className="option-name">None</i>
                </div>
              )}
              {((plugin.documentation.commands || []) as IPluginCommand[]).map(
                c => (
                  <div className="option-item" key={c.name}>
                    <div className="option-name" data-tooltip={c.description}>
                      {c.name}
                    </div>
                    <div className="option-args">
                      {(c.args || []).map(a => (
                        <div
                          key={a.name}
                          className={`option-arg ${
                            a.required ? 'required' : ''
                          }`}
                          data-tooltip={
                            (a.required ? '(required) ' : '') + a.description
                          }
                        >
                          {a.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </Scroll>
        )}
      </div>
      <Footer attached>
        {plugin?.isEnabled && !plugin.isLoaded && (
          <Button
            main
            disabled={waiting}
            data-tooltip="Start the plugin"
            onClick={() => loadPlugin()}
          >
            <IconPlayerPlay />
            Load
          </Button>
        )}
        {plugin?.isEnabled && plugin.isLoaded && (
          <Button
            warn
            data-tooltip="Stop, then start the plugin"
            disabled={waiting}
            onClick={() => reloadPlugin()}
          >
            <IconRefresh />
            Reload
          </Button>
        )}
        <span style={{ flex: 1 }} />
        {plugin?.isEnabled && plugin.isLoaded && (
          <Button
            error
            disabled={waiting}
            data-tooltip="Stop the plugin"
            onClick={() => unloadPlugin()}
          >
            <IconPlayerStop />
            Unload
          </Button>
        )}
        {plugin && !plugin?.isEnabled && (
          <Button
            main
            data-tooltip="Allow the plugin to be started"
            disabled={waiting}
            onClick={() => togglePlugin(true)}
          >
            <IconPlus />
            Enable
          </Button>
        )}
        {plugin?.isEnabled && !plugin.isLoaded && (
          <Button
            error
            data-tooltip="Prevent the plugin from being started"
            disabled={waiting}
            onClick={() => togglePlugin(false)}
          >
            <IconMinus />
            Disable
          </Button>
        )}
      </Footer>
    </div>
  );
};
