/*
  The catalog of metrics panels the web UI can render.

  Every query the web UI can run lives here. Clients name a dashboard and a time
  range; they never send PromQL. This matters more than it looks: a prometheus
  scraping omegga is usually scraping everything else its operator runs, so a
  pass-through query parameter would turn the web UI into a read interface for
  the whole stack rather than for one game server.
*/

import { ScopeName, type Scope } from './scopes';

/** how a panel's values should be drawn */
export type PanelKind =
  /** one number, from an instant query */
  | 'stat'
  /** a line per series, from a range query */
  | 'line'
  /** a filled line per series */
  | 'area'
  /** filled series summed on top of each other */
  | 'stacked'
  /** one row per series, from an instant query */
  | 'table'
  /** a bar per histogram bucket, from an instant query over the whole range */
  | 'histogram';

/** how a panel's values should be formatted */
export type PanelUnit =
  | 'number'
  | 'bytes'
  | 'bytesPerSecond'
  | 'seconds'
  | 'duration'
  | 'ratio'
  | 'perHour'
  | 'bool'
  | 'timestamp';

/**
 * Everything a panel's PromQL is allowed to depend on. Panels build their query
 * from these rather than from raw strings so the instance filter cannot be
 * forgotten and the rate window can follow the selected range.
 */
export type QueryContext = {
  /** a metric selector carrying this omegga's instance filter */
  sel: (metric: string, ...matchers: string[]) => string;
  /** a rate window wide enough for the current step, such as `2m` */
  rate: string;
  /** the whole selected span, for totals rather than rates */
  range: string;
};

export type PanelQuery = {
  /** series name, when the query returns a single unlabelled series */
  name: string;
  build: (q: QueryContext) => string;
  /** take the series name from this label instead, when the query groups */
  legend?: string;
};

export type Panel = {
  id: string;
  title: string;
  /** one word under the value on a stat tile, where the title is too long */
  label?: string;
  description?: string;
  kind: PanelKind;
  unit: PanelUnit;
  queries: PanelQuery[];
};

export type DashboardId = 'players' | 'server' | 'plugins' | 'host';

export type Dashboard = {
  id: DashboardId;
  title: string;
  scope: Scope;
  panels: Panel[];
};

const LABEL_VALUE = /^[A-Za-z0-9_.:-]+$/;

/**
 * Build the selector helper for one omegga's series. Rejects an instance that
 * could break out of the label matcher; the config schema enforces the same
 * shape, so reaching this is a bug rather than a typo.
 */
export function queryContext(options: {
  instance?: string;
  rate: string;
  range: string;
}): QueryContext {
  const { instance, rate, range } = options;
  if (instance != null && !LABEL_VALUE.test(instance))
    throw new Error(`unsafe prometheus instance label: ${instance}`);

  const base = instance ? [`instance="${instance}"`] : [];

  return {
    rate,
    range,
    sel: (metric, ...matchers) => {
      const all = [...base, ...matchers];
      return all.length ? `${metric}{${all.join(',')}}` : metric;
    },
  };
}

/**
 * A rate window for the current step. Prometheus needs at least two samples in
 * the window to produce a point, so a window narrower than a few steps leaves
 * gaps in the line, and one narrower than the scrape interval leaves it empty.
 */
export function rateWindow(step: number): string {
  return `${Math.max(60, step * 4)}s`;
}

/** rate() of a counter, scaled to an hourly figure */
const perHour = (expr: string) => `${expr} * 3600`;

/**
 * A quantile over a histogram, which is the only way to read one. Takes the
 * histogram's base name and appends `_bucket` itself: a histogram exports no
 * series under its base name, so selecting that returns nothing at all rather
 * than failing in any visible way.
 */
const quantile = (q: number, metric: string, ctx: QueryContext) =>
  `histogram_quantile(${q}, sum by (le) (rate(${ctx.sel(`${metric}_bucket`)}[${ctx.rate}])))`;

/**
 * How many observations landed in each of a histogram's buckets over the whole
 * range. Cumulative, as prometheus stores them: the client subtracts each
 * bucket from the next to get the count that belongs to it alone.
 */
const bucketTotals = (metric: string, ctx: QueryContext) =>
  `sum by (le) (increase(${ctx.sel(`${metric}_bucket`)}[${ctx.range}]))`;

const PLAYERS: Panel[] = [
  {
    id: 'online',
    title: 'Players online',
    label: 'Online',
    description: 'Players connected right now',
    kind: 'stat',
    unit: 'number',
    queries: [
      { name: 'online', build: q => q.sel('brickadia_players_online') },
    ],
  },
  {
    id: 'slots',
    title: 'Player slots',
    label: 'Slots',
    description: 'Maximum concurrent players the server allows',
    kind: 'stat',
    unit: 'number',
    queries: [{ name: 'slots', build: q => q.sel('brickadia_players_max') }],
  },
  {
    id: 'unique',
    title: 'Unique players',
    label: 'Unique',
    description: 'Distinct players since omegga last started',
    kind: 'stat',
    unit: 'number',
    queries: [
      {
        name: 'unique',
        build: q => q.sel('brickadia_players_joined_unique_total'),
      },
    ],
  },
  {
    id: 'banned',
    title: 'Banned players',
    label: 'Banned',
    description: 'Players banned right now, counting permanent bans',
    kind: 'stat',
    unit: 'number',
    queries: [{ name: 'banned', build: q => q.sel('brickadia_bans_active') }],
  },
  {
    id: 'playtime',
    title: 'Total playtime',
    label: 'Playtime',
    description: 'Player-seconds connected since omegga last started',
    kind: 'stat',
    unit: 'duration',
    queries: [
      {
        name: 'playtime',
        build: q => q.sel('brickadia_player_playtime_seconds_total'),
      },
    ],
  },
  {
    id: 'online-over-time',
    title: 'Players over time',
    description: 'Connected players, sampled once per scrape',
    kind: 'area',
    unit: 'number',
    queries: [
      { name: 'online', build: q => q.sel('brickadia_players_online') },
    ],
  },
  {
    id: 'connections',
    title: 'Joins and leaves',
    description: 'Joins, leaves, kicks, and bans per hour',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'joins',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_players_joined_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'leaves',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_players_left_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'kicks',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_players_kicked_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'bans',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_players_banned_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
  {
    id: 'chat',
    title: 'Chat activity',
    description: 'Chat messages and slash commands per hour',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'messages',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_chat_messages_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'commands',
        build: q =>
          perHour(`sum(rate(${q.sel('brickadia_commands_total')}[${q.rate}]))`),
      },
    ],
  },
  {
    id: 'session-length',
    title: 'Session length',
    description:
      'How many sessions fell in each length band over the selected range',
    kind: 'histogram',
    unit: 'duration',
    queries: [
      {
        name: 'sessions',
        legend: 'le',
        build: q => bucketTotals('brickadia_player_session_seconds', q),
      },
    ],
  },
  {
    id: 'ping',
    title: 'Player ping',
    description:
      'How many ping samples fell in each band, taken once per status poll',
    kind: 'histogram',
    unit: 'seconds',
    queries: [
      {
        name: 'samples',
        legend: 'le',
        build: q => bucketTotals('brickadia_player_ping_seconds', q),
      },
    ],
  },
  {
    id: 'world-size',
    title: 'World contents',
    description: 'Bricks, components, and entities loaded in the world',
    kind: 'line',
    unit: 'number',
    queries: [
      { name: 'bricks', build: q => q.sel('brickadia_bricks_count') },
      { name: 'components', build: q => q.sel('brickadia_components_count') },
      // only present when the game reports an Entities line in its status
      // header, which current builds do not; the series appears on its own if
      // a later one starts to
      { name: 'entities', build: q => q.sel('brickadia_entities_count') },
    ],
  },
];

const SERVER: Panel[] = [
  {
    id: 'up',
    title: 'Game running',
    label: 'Running',
    description: 'Whether the game is running with a map loaded',
    kind: 'stat',
    unit: 'bool',
    queries: [{ name: 'up', build: q => q.sel('brickadia_up') }],
  },
  {
    id: 'uptime',
    title: 'Uptime',
    label: 'Uptime',
    description: 'How long the game has been running since its last start',
    kind: 'stat',
    unit: 'duration',
    queries: [
      { name: 'uptime', build: q => q.sel('brickadia_uptime_seconds') },
    ],
  },
  {
    id: 'update-available',
    title: 'Up to date',
    label: 'Up to date',
    description:
      'Whether the server is on the newest build, as of the last check',
    kind: 'stat',
    unit: 'bool',
    queries: [
      {
        // inverted so the tile reads as a state of health: YES is the good
        // outcome, and shares the green that every other bool tile gives it
        name: 'up to date',
        build: q => `1 - ${q.sel('brickadia_update_available')}`,
      },
    ],
  },
  {
    id: 'availability',
    title: 'Availability',
    description: 'Whether the game was running and answering status polls',
    kind: 'line',
    unit: 'bool',
    queries: [
      { name: 'up', build: q => q.sel('brickadia_up') },
      { name: 'responsive', build: q => q.sel('brickadia_status_responsive') },
    ],
  },
  {
    id: 'lifecycle',
    title: 'Restarts and crashes',
    description: 'Starts, crashes, autorestarts, and map changes per hour',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'starts',
        build: q =>
          perHour(`sum(rate(${q.sel('brickadia_starts_total')}[${q.rate}]))`),
      },
      {
        name: 'crashes',
        build: q =>
          perHour(`sum(rate(${q.sel('brickadia_crashes_total')}[${q.rate}]))`),
      },
      {
        name: 'autorestarts',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_autorestarts_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'map changes',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_map_changes_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
  {
    id: 'log-throughput',
    title: 'Log throughput',
    description: 'A flatline is the earliest sign the game has wedged',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'log lines',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_log_lines_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'stderr lines',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_stderr_lines_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
  {
    id: 'status-latency',
    title: 'Status poll duration',
    description: 'A good proxy for game hitching',
    kind: 'line',
    unit: 'seconds',
    queries: [
      {
        name: 'p50',
        build: q => quantile(0.5, 'brickadia_status_poll_duration_seconds', q),
      },
      {
        name: 'p95',
        build: q => quantile(0.95, 'brickadia_status_poll_duration_seconds', q),
      },
    ],
  },
  {
    id: 'status-failures',
    title: 'Status poll failures',
    description: 'Status polls that timed out or could not be parsed, per hour',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'failures',
        build: q =>
          perHour(
            `sum(rate(${q.sel('brickadia_status_poll_failures_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
  {
    id: 'errors',
    title: 'Uncaught errors',
    description:
      "Exceptions and promise rejections that reached omegga's process handlers",
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'exceptions',
        build: q =>
          perHour(
            `sum(rate(${q.sel('omegga_uncaught_exceptions_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'rejections',
        build: q =>
          perHour(
            `sum(rate(${q.sel('omegga_unhandled_rejections_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
];

const PLUGINS: Panel[] = [
  {
    id: 'loaded',
    title: 'Plugins loaded',
    label: 'Loaded',
    description: 'Plugins currently running',
    kind: 'stat',
    unit: 'number',
    queries: [{ name: 'loaded', build: q => q.sel('omegga_plugins_loaded') }],
  },
  {
    id: 'enabled',
    title: 'Plugins enabled',
    label: 'Enabled',
    description: 'Plugins allowed to load',
    kind: 'stat',
    unit: 'number',
    queries: [{ name: 'enabled', build: q => q.sel('omegga_plugins_enabled') }],
  },
  {
    id: 'scanned',
    title: 'Plugins installed',
    label: 'Installed',
    description: 'Plugins found in the plugins directory',
    kind: 'stat',
    unit: 'number',
    queries: [{ name: 'scanned', build: q => q.sel('omegga_plugins_scanned') }],
  },
  {
    id: 'state',
    title: 'Plugin state',
    description:
      'Whether each plugin is loaded now, and when that last changed',
    kind: 'table',
    unit: 'bool',
    queries: [
      {
        name: 'loaded',
        legend: 'plugin',
        build: q => q.sel('omegga_plugin_loaded'),
      },
    ],
  },
  {
    id: 'plugin-errors',
    title: 'Plugin errors',
    description: 'Load, unload, and runtime failures per plugin, per hour',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'errors',
        legend: 'plugin',
        build: q =>
          perHour(
            `sum by (plugin) (rate(${q.sel('omegga_plugin_errors_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
  {
    id: 'plugin-series',
    title: 'Metric series per plugin',
    description: 'Plugins approaching the series cap stop exporting new ones',
    kind: 'line',
    unit: 'number',
    queries: [
      {
        name: 'series',
        legend: 'plugin',
        build: q => q.sel('omegga_plugin_metrics_series'),
      },
    ],
  },
  {
    id: 'plugin-metric-failures',
    title: 'Plugin metric failures',
    description: 'Metrics refused by the limits, or whose collect() threw',
    kind: 'line',
    unit: 'perHour',
    queries: [
      {
        name: 'dropped',
        build: q =>
          perHour(
            `sum(rate(${q.sel('omegga_plugin_metrics_dropped_total')}[${q.rate}]))`,
          ),
      },
      {
        name: 'errors',
        build: q =>
          perHour(
            `sum(rate(${q.sel('omegga_plugin_metrics_errors_total')}[${q.rate}]))`,
          ),
      },
    ],
  },
];

const HOST: Panel[] = [
  {
    id: 'cpu',
    title: 'Host CPU',
    label: 'CPU',
    description: 'Host CPU in use across all cores',
    kind: 'stat',
    unit: 'ratio',
    queries: [{ name: 'cpu', build: q => q.sel('omegga_host_cpu_ratio') }],
  },
  {
    id: 'memory',
    title: 'Host memory used',
    label: 'Memory',
    description: 'Host memory in use',
    kind: 'stat',
    unit: 'bytes',
    queries: [
      { name: 'memory', build: q => q.sel('omegga_host_memory_used_bytes') },
    ],
  },
  {
    id: 'disk',
    title: 'Disk free',
    label: 'Disk free',
    description: "Disk space still available on omegga's filesystem",
    kind: 'stat',
    unit: 'bytes',
    queries: [
      {
        name: 'disk',
        build: q =>
          `${q.sel('omegga_host_disk_total_bytes')} - ${q.sel('omegga_host_disk_used_bytes')}`,
      },
    ],
  },
  {
    id: 'cpu-over-time',
    title: 'Host CPU',
    description: 'Host CPU in use across all cores',
    kind: 'area',
    unit: 'ratio',
    queries: [{ name: 'cpu', build: q => q.sel('omegga_host_cpu_ratio') }],
  },
  {
    id: 'memory-over-time',
    title: 'Host memory',
    description: 'Host memory in use against what is installed',
    kind: 'line',
    unit: 'bytes',
    queries: [
      { name: 'used', build: q => q.sel('omegga_host_memory_used_bytes') },
      { name: 'total', build: q => q.sel('omegga_host_memory_total_bytes') },
    ],
  },
  {
    id: 'network',
    title: 'Host network',
    description: 'Bytes per second across every non-loopback interface',
    kind: 'line',
    unit: 'bytesPerSecond',
    queries: [
      {
        name: 'receive',
        build: q =>
          `sum(rate(${q.sel('omegga_host_network_receive_bytes_total')}[${q.rate}]))`,
      },
      {
        name: 'transmit',
        build: q =>
          `sum(rate(${q.sel('omegga_host_network_transmit_bytes_total')}[${q.rate}]))`,
      },
    ],
  },
  {
    id: 'game-memory',
    title: 'Game process memory',
    description: 'Resident memory held by the Brickadia process',
    kind: 'area',
    unit: 'bytes',
    queries: [
      {
        name: 'resident',
        build: q => q.sel('brickadia_process_resident_memory_bytes'),
      },
    ],
  },
  {
    id: 'game-cpu',
    title: 'Game process CPU',
    description: 'Cores consumed by the game, where 1 is one saturated core',
    kind: 'line',
    unit: 'number',
    queries: [
      {
        name: 'game',
        build: q =>
          `rate(${q.sel('brickadia_process_cpu_seconds_total')}[${q.rate}])`,
      },
      {
        name: 'omegga',
        build: q => `rate(${q.sel('process_cpu_seconds_total')}[${q.rate}])`,
      },
    ],
  },
  {
    id: 'omegga-memory',
    title: 'Omegga process memory',
    description: 'Resident memory and V8 heap held by omegga itself',
    kind: 'line',
    unit: 'bytes',
    queries: [
      {
        name: 'resident',
        build: q => q.sel('process_resident_memory_bytes'),
      },
      {
        name: 'heap used',
        build: q => q.sel('nodejs_heap_size_used_bytes'),
      },
    ],
  },
  {
    id: 'scrapes',
    title: 'Scrape duration',
    description: 'How long omegga takes to answer prometheus',
    kind: 'line',
    unit: 'seconds',
    queries: [
      {
        name: 'p95',
        build: q => quantile(0.95, 'omegga_scrape_duration_seconds', q),
      },
    ],
  },
];

export const DASHBOARDS: Dashboard[] = [
  {
    id: 'players',
    title: 'Players',
    scope: ScopeName.MetricsPlayers,
    panels: PLAYERS,
  },
  {
    id: 'server',
    title: 'Server health',
    scope: ScopeName.MetricsServer,
    panels: SERVER,
  },
  {
    id: 'plugins',
    title: 'Plugins',
    scope: ScopeName.MetricsPlugins,
    panels: PLUGINS,
  },
  {
    id: 'host',
    title: 'Host health',
    scope: ScopeName.MetricsHost,
    panels: HOST,
  },
];

export const DASHBOARD_IDS = DASHBOARDS.map(d => d.id);

export function getDashboard(id: string): Dashboard | undefined {
  return DASHBOARDS.find(d => d.id === id);
}
