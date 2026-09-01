import {
  AnimatedDropdown,
  Button,
  NavBar,
  NavHeader,
  PageContent,
  Scroll,
  SideNav,
  Toggle,
} from '@components';
import { useRequireAnyScope } from '@hooks';
import { IconAlertTriangle, IconApps } from '@tabler/icons-react';
import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Permissions } from '../../permissions';
import { trpc } from '../../trpc';
import { Panel, type PanelData, type PanelSummary } from './Panel';

const METRICS_SCOPES = [
  Permissions.MetricsPlayers,
  Permissions.MetricsServer,
  Permissions.MetricsPlugins,
  Permissions.MetricsHost,
] as const;

const RANGES = [
  { label: '1h', seconds: 3600 },
  { label: '6h', seconds: 6 * 3600 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 7 * 86400 },
  { label: '15d', seconds: 15 * 86400 },
];

const HIDDEN_KEY = 'omeggaMetricsHidden';

/**
 * Panels the user has switched off, by dashboard. Hidden ids are stored rather
 * than visible ones so a panel added in a later version shows up by default
 * instead of being invisible to everyone who has ever opened this view.
 */
function loadHidden(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const MetricsView = () => {
  const allowed = useRequireAnyScope(...METRICS_SCOPES);
  const [, navigate] = useLocation();
  const [, params] = useRoute('/metrics/:view?');

  const [range, setRange] = useState(RANGES[2].seconds);
  const [hidden, setHidden] = useState<Record<string, string[]>>(loadHidden);
  const [showPanelList, setShowPanelList] = useState(false);

  const info = trpc.metrics.info.useQuery(undefined, { enabled: allowed });
  const health = trpc.metrics.health.useQuery(undefined, {
    enabled: allowed,
    refetchInterval: 30_000,
  });

  const dashboards = useMemo(() => info.data?.dashboards ?? [], [info.data]);
  const active = useMemo(
    () => dashboards.find(d => d.id === params?.view) ?? dashboards[0] ?? null,
    [dashboards, params?.view],
  );

  useEffect(() => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  }, [hidden]);

  const ranges = useMemo(() => {
    const max = (info.data?.retentionDays ?? 15) * 86400;
    // a range past retention comes back partially filled with no error, which
    // reads as missing data rather than as a limit, so don't offer one
    return RANGES.filter(r => r.seconds <= max);
  }, [info.data?.retentionDays]);

  const dashboard = trpc.metrics.dashboard.useQuery(
    { id: active?.id ?? '', range },
    {
      enabled: allowed && !!active && (health.data?.ok ?? false),
      refetchInterval: 15_000,
      // changing the range or tab makes a new query key, and without this the
      // panels would empty out and collapse to their loading height while the
      // new data lands, shifting everything below them
      placeholderData: keepPreviousData,
    },
  );

  const results = useMemo(() => {
    const byId = new Map<string, PanelData>();
    for (const panel of dashboard.data?.panels ?? [])
      byId.set(panel.id, panel as PanelData);
    return byId;
  }, [dashboard.data]);

  // Panels kept from the previous fetch still render, so a range change never
  // collapses the grid. Panels with no carried-over data show a loader rather
  // than "no data", which is what switching dashboards looks like.
  const stale = dashboard.isLoading || dashboard.isPlaceholderData;

  const hiddenHere = hidden[active?.id ?? ''] ?? [];
  const togglePanel = (id: string) => {
    if (!active) return;
    const next = hiddenHere.includes(id)
      ? hiddenHere.filter(p => p !== id)
      : [...hiddenHere, id];
    setHidden({ ...hidden, [active.id]: next });
  };

  const visiblePanels: PanelSummary[] = (active?.panels ?? []).filter(
    p => !hiddenHere.includes(p.id),
  );
  const stats = visiblePanels.filter(p => p.kind === 'stat');
  const rest = visiblePanels.filter(p => p.kind !== 'stat');

  if (!allowed) return null;

  return (
    <>
      <NavHeader title="Metrics">
        {active && (
          <div className="widgets-container metrics-panel-list">
            <Button
              normal
              boxy
              data-tooltip="Choose which panels this dashboard shows"
              onClick={() => setShowPanelList(!showPanelList)}
            >
              <IconApps />
              Panels
            </Button>
            <AnimatedDropdown visible={showPanelList}>
              {active.panels.map(panel => {
                const isHidden = hiddenHere.includes(panel.id);
                return (
                  <div key={panel.id} className="widget-item">
                    <div className="name">{panel.title}</div>
                    <Toggle
                      value={!isHidden}
                      tooltip={isHidden ? 'Show panel' : 'Hide panel'}
                      onChange={() => togglePanel(panel.id)}
                    />
                  </div>
                );
              })}
            </AnimatedDropdown>
          </div>
        )}
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container metrics-container">
          <NavBar className="metrics-tabs">
            <div className="metrics-tab-group">
              {dashboards.map(d => (
                <Button
                  key={d.id}
                  normal={active?.id !== d.id}
                  main={active?.id === d.id}
                  boxy
                  onClick={() => navigate(`/metrics/${d.id}`)}
                >
                  {d.title}
                </Button>
              ))}
            </div>
            <div className="metrics-range-group">
              {ranges.map(r => (
                <Button
                  key={r.label}
                  normal={range !== r.seconds}
                  main={range === r.seconds}
                  boxy
                  data-tooltip={`Show the last ${r.label}`}
                  onClick={() => setRange(r.seconds)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </NavBar>

          <Scroll>
            <div className="metrics-content">
              {health.data && !health.data.ok && (
                <div className="metrics-banner error">
                  <IconAlertTriangle />
                  <div>
                    <strong>Metrics are unavailable.</strong>{' '}
                    {health.data.configured
                      ? (health.data.error ??
                        'Prometheus did not answer this request.')
                      : 'No prometheus is configured for this omegga.'}
                  </div>
                </div>
              )}

              {health.data?.ok && !health.data.hasSeries && (
                <div className="metrics-banner warn">
                  <IconAlertTriangle />
                  <div>
                    <strong>Prometheus has no data for this server.</strong> It
                    is reachable, but nothing is scraping omegga
                    {info.data?.instance
                      ? ` under the instance ${info.data.instance}`
                      : ''}
                    . Check the scrape config and the metrics endpoint.
                  </div>
                </div>
              )}

              {stats.length > 0 && (
                <div className="metrics-stats">
                  {stats.map(panel => (
                    <Panel
                      key={panel.id}
                      panel={panel}
                      data={results.get(panel.id)}
                      loading={stale}
                    />
                  ))}
                </div>
              )}

              <div className="metrics-grid">
                {rest.map(panel => (
                  <Panel
                    key={panel.id}
                    panel={panel}
                    data={results.get(panel.id)}
                    loading={stale}
                  />
                ))}
              </div>

              {visiblePanels.length === 0 && active && (
                <div className="metrics-banner">
                  <div>Every panel on this dashboard is hidden.</div>
                </div>
              )}
            </div>
          </Scroll>
        </div>
      </PageContent>
    </>
  );
};
