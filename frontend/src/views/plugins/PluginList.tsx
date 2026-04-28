import {
  Button,
  Input,
  Loader,
  NavBar,
  NavHeader,
  PageContent,
  Scroll,
  SideNav,
} from '@components';
import {
  IconAlertCircle,
  IconBug,
  IconCircleCheck,
  IconPower,
  IconRefreshAlert,
  IconRotate,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { trpc } from '../../trpc';
import { PluginInspector } from './PluginInspector';

type PluginListItem = {
  name: string;
  documentation: any;
  path: string;
  isLoaded: boolean;
  isEnabled: boolean;
};

export type PluginInfo = Pick<
  PluginListItem,
  'name' | 'isLoaded' | 'isEnabled'
>;

const pluginStateFromInfo = (info: PluginInfo) => {
  const state = (info.isLoaded ? 2 : 0) + (info.isEnabled ? 1 : 0);
  const status = ['disabled', 'broken', 'bugged', 'running'][state];
  const tooltip = [
    'Plugin is disabled',
    'Plugin is enabled but not running',
    'Plugin is running but not enabled',
    'Plugin is running',
  ][state];
  const icon = [IconPower, IconAlertCircle, IconBug, IconCircleCheck][state];
  return { ...info, state, status, tooltip, icon };
};
type PluginRenderInfo = ReturnType<typeof pluginStateFromInfo>;

export const PluginList = () => {
  const [search, setSearch] = useState('');
  const [reloading, setReloading] = useState(false);
  const [plugins, setPlugins] = useState<any[]>([]);

  const [_location, params] = useRoute('/plugins/:id?');
  const selectedPluginName = useMemo(
    () =>
      plugins.find(plugin => plugin.path === params?.id)?.name ??
      'SELECT A PLUGIN',
    [plugins, params?.id],
  );

  const listQuery = trpc.plugin.list.useQuery();

  useEffect(() => {
    if (listQuery.data) {
      setPlugins(listQuery.data.map(pluginStateFromInfo));
    }
  }, [listQuery.data]);
  const loading = listQuery.isLoading;

  const reloadAllMutation = trpc.plugin.reloadAll.useMutation();

  const getPlugins = () => {
    listQuery.refetch();
  };

  const reloadPlugins = async () => {
    setReloading(true);
    await reloadAllMutation.mutateAsync();
    setReloading(false);
  };

  const matches = (plugin: PluginRenderInfo) =>
    plugin.name.toLowerCase().includes(search.toLowerCase());

  trpc.plugin.onStatus.useSubscription(undefined, {
    onData(data) {
      const plugin = pluginStateFromInfo(data);
      setPlugins(prev =>
        prev.map(p => (p.path === data.shortPath ? { ...p, ...plugin } : p)),
      );
    },
  });

  return (
    <>
      <NavHeader title="Plugins">
        <span style={{ flex: 1 }} />
        <Button
          warn
          disabled={reloading}
          onClick={reloadPlugins}
          data-tooltip="Reload all plugins, this may clear current plugin progress"
        >
          <IconRefreshAlert />
          Reload Plugins
        </Button>
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container plugins-container">
          <div className="plugins-list-container">
            <NavBar>
              <Input
                type="text"
                placeholder="Search Plugins..."
                value={search}
                onChange={s => setSearch(s)}
              />
              <span style={{ flex: 1 }} />
              <Button
                icon
                normal
                data-tooltip="Refresh plugin list"
                onClick={getPlugins}
              >
                <IconRotate />
              </Button>
            </NavBar>
            <div className="plugins-list">
              <Scroll>
                {plugins.map(
                  plugin =>
                    matches(plugin) && (
                      <Link
                        href={'/plugins/' + plugin.path}
                        key={plugin.path}
                        data-tooltip={plugin.documentation?.description}
                        className={`plugin-item ${params?.id === plugin.path ? 'selected' : ''}`}
                      >
                        <plugin.icon
                          className={plugin.status}
                          data-tooltip={plugin.tooltip}
                        />
                        {plugin.name}
                      </Link>
                    ),
                )}
              </Scroll>
              <Loader active={loading} size="huge">
                Loading Plugins
              </Loader>
            </div>
          </div>
          <div className="plugin-inspector-container">
            <NavBar attached>{selectedPluginName}</NavBar>
            <div className="plugin-inspector">
              <PluginInspector />
            </div>
          </div>
        </div>
      </PageContent>
    </>
  );
};
