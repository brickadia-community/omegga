/*
  Game server metrics.

  Most of these come from events omegga already parses out of the game log, so
  they cost nothing. The world stats (bricks, components, ...) need a
  `br.Server.Status` console command, which is cached: see StatusCache below.
*/

import { type IMetricsConfig } from '@config/types';
import type Omegga from '@omegga/server';
import { type IServerStatus } from '@omegga/types';
import { METRICS_DEFAULTS } from '@/softconfig';
import {
  getLastSteamUpdateCheck,
  getLastUpdateTime,
  getUpdateCount,
  isUpdatingGame,
} from '@/updater/steam';
import { type Registry, type ScalarSample } from '../registry';

/** how long a scrape will wait for the very first status, in ms */
const FIRST_STATUS_TIMEOUT = 2000;

/** lifecycle states, exactly one of which is 1 at any time */
const STATES = [
  'starting',
  'running',
  'stopping',
  'stopped',
  'updating',
] as const;
type ServerState = (typeof STATES)[number];

/**
 * Caches the result of `br.Server.Status`.
 *
 * The web UI's heartbeat polls this once a minute, but it only exists when the
 * web UI is enabled, so the cache also refreshes itself on scrape. That
 * refresh is single-flight and rate limited to one poll per `maxAge`, so any
 * number of prometheus replicas still cost at most one console command per
 * window. A scrape serves whatever is cached and refreshes in the background;
 * only a scrape that has never seen a status waits, and only briefly. A wedged
 * game therefore shows up as `brickadia_up 0` rather than as a stalled scrape.
 */
class StatusCache {
  private omegga: Omegga;
  private maxAgeMs: number;
  private inFlight: Promise<void> | null = null;

  status: IServerStatus | null = null;
  updatedAt = 0;
  failures = 0;
  /** whether the most recent poll answered; null until one has been attempted */
  lastPollOk: boolean | null = null;
  /** seconds the last poll took, for the duration histogram */
  onPoll: ((seconds: number) => void) | undefined;

  constructor(omegga: Omegga, maxAgeMs: number) {
    this.omegga = omegga;
    this.maxAgeMs = maxAgeMs;
  }

  get ageMs(): number {
    return this.updatedAt === 0 ? Infinity : Date.now() - this.updatedAt;
  }

  /** accept a status the heartbeat already paid for */
  offer(status: IServerStatus): void {
    this.status = status;
    this.updatedAt = Date.now();
  }

  /** the game can only answer a console command while it is actually running */
  private get pollable(): boolean {
    const { started, starting, stopping } = this.omegga;
    return started && !starting && !stopping;
  }

  private async poll(): Promise<void> {
    const start = process.hrtime.bigint();
    try {
      const status = await this.omegga.getServerStatus();
      this.onPoll?.(Number(process.hrtime.bigint() - start) / 1e9);
      if (status) {
        this.offer(status);
        this.lastPollOk = true;
      } else {
        this.failures++;
        this.lastPollOk = false;
      }
    } catch {
      // a timed-out status means the game stopped answering console commands,
      // which `brickadia_status_responsive` reports
      this.failures++;
      this.lastPollOk = false;
    } finally {
      this.inFlight = null;
    }
  }

  /**
   * Refresh if stale. Returns a promise only when the caller should wait for
   * it, which is the first scrape and nothing else.
   */
  refresh(): Promise<void> | null {
    if (!this.pollable || this.ageMs < this.maxAgeMs) return null;
    this.inFlight ??= this.poll();
    // every later scrape reads the cache and lets the refresh land in the
    // background, so a hung game never holds up prometheus
    return this.status === null ? this.inFlight : null;
  }
}

export type BrickadiaCollector = {
  /** called before rendering a scrape; may need awaiting on the first one */
  beforeScrape(): Promise<void> | null;
};

export function registerBrickadiaMetrics(
  registry: Registry,
  omegga: Omegga,
  config: IMetricsConfig,
): BrickadiaCollector {
  const maxAgeMs =
    (config.statusMaxAge ?? METRICS_DEFAULTS.statusMaxAge) * 1000;
  const cache = new StatusCache(omegga, maxAgeMs);

  // the heartbeat already polls once a minute when the web UI is on
  omegga.on('metrics:heartbeat', (status: IServerStatus) =>
    cache.offer(status),
  );

  // ---- info ----

  registry
    .gauge({
      name: 'brickadia_server_info',
      help: 'Brickadia server build and configuration, always 1',
      labels: ['version', 'server_name', 'map', 'steambeta', 'port'],
    })
    .collect(() => [
      {
        labels: {
          // -1 until the binary or the log reports a build
          version: omegga.version > 0 ? String(omegga.version) : '',
          // the configured name is preferred over the live one: a server
          // that puts a changing value (a player count, a countdown) in its
          // name would mint a new series on every change
          server_name:
            omegga.config.server?.name ?? cache.status?.serverName ?? '',
          map: omegga.currentMap ?? '',
          steambeta: omegga.config.server?.steambeta ?? '',
          port: String(omegga.config.server?.port ?? ''),
        },
        value: 1,
      },
    ]);

  // ---- lifecycle ----

  const currentState = (): ServerState => {
    if (isUpdatingGame()) return 'updating';
    if (omegga.stopping) return 'stopping';
    if (omegga.starting) return 'starting';
    return omegga.started ? 'running' : 'stopped';
  };

  registry
    .gauge({
      name: 'brickadia_server_state',
      help: 'Current server lifecycle state, 1 for the active state',
      labels: ['state'],
    })
    .collect((): ScalarSample[] => {
      const state = currentState();
      return STATES.map(s => ({
        labels: { state: s },
        value: s === state ? 1 : 0,
      }));
    });

  // the same information as flat booleans, which are far easier to alert on
  // than a label match
  registry
    .gauge({
      name: 'brickadia_starting',
      help: 'Whether the Brickadia server is starting up',
    })
    .collect(() => (omegga.starting ? 1 : 0));
  registry
    .gauge({
      name: 'brickadia_stopping',
      help: 'Whether the Brickadia server is shutting down',
    })
    .collect(() => (omegga.stopping ? 1 : 0));
  registry
    .gauge({
      name: 'brickadia_updating',
      help: 'Whether a Brickadia game update is being downloaded',
    })
    .collect(() => (isUpdatingGame() ? 1 : 0));

  registry
    .gauge({
      name: 'brickadia_up',
      help: 'Whether the Brickadia server is running with a map loaded',
    })
    .collect(() => (omegga.started && !omegga.stopping ? 1 : 0));

  registry
    .gauge({
      name: 'brickadia_status_responsive',
      help: 'Whether the last server status poll was answered',
    })
    .collect(() => {
      if (!omegga.started || omegga.stopping) return [];
      // absent rather than 0 until a poll has actually been attempted
      return cache.lastPollOk === null ? [] : cache.lastPollOk ? 1 : 0;
    });

  registry
    .gauge({
      name: 'brickadia_uptime_seconds',
      help: 'Uptime reported by the Brickadia server',
    })
    .collect(() => (cache.status ? cache.status.time / 1000 : []));

  const startTime = registry.gauge({
    name: 'brickadia_start_time_seconds',
    help: 'Unix timestamp of the last Brickadia server start',
  });

  // ---- updates ----

  registry
    .gauge({
      name: 'brickadia_update_available',
      help: 'Whether a Brickadia update was available at the last check',
    })
    .collect(() => (getLastSteamUpdateCheck().result ? 1 : 0));
  registry
    .gauge({
      name: 'brickadia_update_check_timestamp_seconds',
      help: 'Unix timestamp of the last Brickadia update check',
    })
    .collect(() => getLastSteamUpdateCheck().attempt / 1000);
  registry
    .counter({
      name: 'brickadia_updates_total',
      help: 'Number of Brickadia game updates downloaded',
    })
    .collect(() => getUpdateCount());
  registry
    .gauge({
      name: 'brickadia_last_update_timestamp_seconds',
      help: 'Unix timestamp of the last completed Brickadia game update',
    })
    .collect(() => getLastUpdateTime() / 1000);

  // ---- events ----

  const starts = registry.counter({
    name: 'brickadia_starts_total',
    help: 'Number of times the Brickadia server has started',
  });
  const stops = registry.counter({
    name: 'brickadia_stops_total',
    help: 'Number of times the Brickadia server has stopped',
  });
  const crashes = registry.counter({
    name: 'brickadia_crashes_total',
    help: 'Number of detected Brickadia engine crashes',
  });
  const mapChanges = registry.counter({
    name: 'brickadia_map_changes_total',
    help: 'Number of map changes',
  });
  const autorestarts = registry.counter({
    name: 'brickadia_autorestarts_total',
    help: 'Number of automatic restarts triggered',
  });
  const joins = registry.counter({
    name: 'brickadia_players_joined_total',
    help: 'Number of player joins',
  });
  const uniqueJoins = registry.counter({
    name: 'brickadia_players_joined_unique_total',
    help: 'Number of distinct players seen since omegga started',
  });
  const leaves = registry.counter({
    name: 'brickadia_players_left_total',
    help: 'Number of player disconnects',
  });
  const kicks = registry.counter({
    name: 'brickadia_players_kicked_total',
    help: 'Number of players kicked',
  });
  const chat = registry.counter({
    name: 'brickadia_chat_messages_total',
    help: 'Number of chat messages sent by players',
  });
  const commands = registry.counter({
    name: 'brickadia_commands_total',
    help: 'Number of chat commands run by players',
  });
  const unknownCommands = registry.counter({
    name: 'brickadia_unknown_commands_total',
    help: 'Number of unrecognized chat commands',
  });
  const interactions = registry.counter({
    name: 'brickadia_interactions_total',
    help: 'Number of brick interactions',
  });
  const logLines = registry.counter({
    name: 'brickadia_log_lines_total',
    help: 'Number of lines read from the Brickadia server log',
  });
  const stderrLines = registry.counter({
    name: 'brickadia_stderr_lines_total',
    help: 'Number of lines the Brickadia server wrote to stderr',
  });

  const playtime = registry.counter({
    name: 'brickadia_player_playtime_seconds_total',
    help: 'Total player-seconds spent connected to the server',
  });
  // An event counter with no samples yet renders as HELP/TYPE and nothing
  // else, which shows up in dashboards as "no data" rather than zero. Seeding
  // the unlabelled series makes a quiet server report quiet instead of absent.
  for (const counter of [
    starts,
    stops,
    crashes,
    mapChanges,
    autorestarts,
    joins,
    uniqueJoins,
    leaves,
    kicks,
    chat,
    commands,
    unknownCommands,
    interactions,
    logLines,
    stderrLines,
  ]) {
    counter.inc(0);
  }

  const sessions = registry.histogram({
    name: 'brickadia_player_session_seconds',
    help: 'How long players stayed connected',
    buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800],
  });
  const pings = registry.histogram({
    name: 'brickadia_player_ping_seconds',
    help: 'Player ping sampled each time the server status is polled',
    buckets: [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 1],
  });
  const pollDuration = registry.histogram({
    name: 'brickadia_status_poll_duration_seconds',
    help: 'Time taken by a br.Server.Status console command',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  });
  cache.onPoll = seconds => pollDuration.observe(seconds);

  registry
    .counter({
      name: 'brickadia_status_poll_failures_total',
      help: 'Number of server status polls that timed out or failed to parse',
    })
    .collect(() => cache.failures);

  // unique joins are counted by id; a Set is monotonic within a process, so
  // this stays a valid counter
  const seenPlayers = new Set<string>();
  // join times, so a session length can be observed on leave
  const joinedAt = new Map<string, number>();

  // Player-seconds from sessions that have ended. Sessions still in progress
  // are added at collect time, so the total climbs smoothly while players are
  // connected instead of jumping when they leave. Summing per player rather
  // than sampling the player count keeps it exact regardless of whether
  // `omegga.players` has been updated by the time an event fires.
  let endedPlaytimeSeconds = 0;
  const endSession = (id: string, now: number) => {
    const joined = joinedAt.get(id);
    if (joined == null) return null;
    const seconds = (now - joined) / 1000;
    endedPlaytimeSeconds += seconds;
    joinedAt.delete(id);
    return seconds;
  };

  omegga.on('start', () => {
    starts.inc();
    startTime.set(Date.now() / 1000);
  });
  omegga.on('server:stopped', () => {
    stops.inc();
    // A stopping server emits no 'leave' for anyone still connected, so their
    // sessions are ended here. Without this the playtime counter would go
    // backwards, and the session histogram would lose exactly the long
    // sessions a restart is most likely to interrupt, biasing it short.
    const now = Date.now();
    for (const id of [...joinedAt.keys()]) {
      const seconds = endSession(id, now);
      if (seconds != null) sessions.observe(seconds);
    }
  });
  omegga.on('mapchange', () => mapChanges.inc());
  omegga.on('autorestart', () => autorestarts.inc());
  omegga.on('line', () => logLines.inc());
  omegga.on('err', () => stderrLines.inc());
  omegga.on('chat', () => chat.inc());
  omegga.on('cmd', () => commands.inc());
  omegga.on('unknownCommand', () => unknownCommands.inc());
  omegga.on('interact', () => interactions.inc());
  omegga.on('kick', () => kicks.inc());

  omegga.on('join', (player: { id: string }) => {
    joins.inc();
    if (!seenPlayers.has(player.id)) {
      seenPlayers.add(player.id);
      uniqueJoins.inc();
    }
    joinedAt.set(player.id, Date.now());
  });

  omegga.on('leave', (player: { id: string }) => {
    leaves.inc();
    const seconds = endSession(player.id, Date.now());
    if (seconds != null) sessions.observe(seconds);
  });

  // a crash is detected on the log line, but the counter is bumped on exit so
  // it lines up with the restart
  omegga.on('exit', () => {
    if (omegga.crashDetected) crashes.inc();
  });

  // ---- world stats ----

  playtime.collect(() => {
    const now = Date.now();
    let total = endedPlaytimeSeconds;
    for (const joined of joinedAt.values()) total += (now - joined) / 1000;
    return total;
  });

  registry
    .gauge({
      name: 'brickadia_players_online',
      help: 'Number of players currently connected',
    })
    // read live rather than from the status cache, so the count is never stale
    .collect(() => omegga.players.length);

  registry
    .gauge({
      name: 'brickadia_players_max',
      help: 'Maximum number of player slots',
    })
    .collect(() => cache.status?.maxPlayers ?? []);

  registry
    .gauge({
      name: 'brickadia_status_age_seconds',
      help: 'Age of the cached server status',
    })
    .collect(() => (cache.updatedAt === 0 ? [] : cache.ageMs / 1000));

  // Bricks and components get named gauges because they are always reported.
  // Everything else in the status header is exported generically, so a stat the
  // game adds later (entities, say) becomes a metric with no code change.
  const stat = (key: string, name: string, help: string) =>
    registry
      .gauge({ name, help })
      .collect(() => cache.status?.stats?.[key] ?? []);

  stat('bricks', 'brickadia_bricks_count', 'Number of bricks loaded');
  stat(
    'components',
    'brickadia_components_count',
    'Number of brick components loaded',
  );
  stat('entities', 'brickadia_entities_count', 'Number of entities loaded');

  // one gauge per stat the game reports, created on first sight
  const dynamicStats = new Map<string, string>();
  const KNOWN_STATS = ['bricks', 'components', 'entities'];

  // the ping histogram is fed once per status poll, not once per scrape, so
  // the observation count tracks polls rather than however many scrapers exist
  let lastPingSample = 0;
  const samplePings = () => {
    if (!cache.status || cache.updatedAt === lastPingSample) return;
    lastPingSample = cache.updatedAt;
    for (const player of cache.status.players)
      pings.observe(player.ping / 1000);
  };

  return {
    beforeScrape() {
      const pending = cache.refresh();
      samplePings();

      for (const key of Object.keys(cache.status?.stats ?? {})) {
        if (KNOWN_STATS.includes(key) || dynamicStats.has(key)) continue;
        const name = `brickadia_${key}_count`;
        dynamicStats.set(key, name);
        registry
          .gauge({ name, help: `Number of ${key.replace(/_/g, ' ')} loaded` })
          .collect(() => cache.status?.stats?.[key] ?? []);
      }

      if (!pending) return null;
      // bound the one scrape that is allowed to wait
      return Promise.race([
        pending,
        new Promise<void>(resolve =>
          setTimeout(resolve, FIRST_STATUS_TIMEOUT).unref(),
        ),
      ]);
    },
  };
}
