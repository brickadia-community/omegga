// AUTO-GENERATED command name table. Maps each Brickadia console command to
// its name across game versions so plugins/omegga can address commands without
// hardcoding a name that changes between releases.
//
// At CL 14349 nearly every console command gained the `br.` prefix (and a
// handful were restructured). Before that, the legacy names were used.
// Minigames were deprecated at CL 14000 and replaced by GameMode commands;
// the legacy Minigames commands still resolve but are no-ops on newer servers.
//
// Resolve the version-correct name with `omegga.Console`, e.g.
// `omegga.Console.Bricks.Clear` -> "Bricks.Clear" or "br.Bricks.Clear".
//
// Where a command is both a value and a namespace (e.g. `br.DrawDebug.Colliders`
// and `br.DrawDebug.Colliders.DrawCOM`), the command itself lives under `$`.

/** CL version at which console commands gained the `br.` prefix. */
const RENAME_VERSION = 14349;

/** A console command whose name may differ across game versions. */
export class ConsoleCommand {
  /** @param versions [sinceVersion, name] pairs in ascending version order */
  constructor(private readonly versions: readonly [number, string][]) {}

  /** Resolve the command name for a given game CL version. */
  resolve(version: number): string {
    // unknown version (server not started / not detected yet) -> newest name
    if (!version || version < 0)
      return this.versions[this.versions.length - 1][1];
    let name = this.versions[0][1];
    for (const [since, candidate] of this.versions)
      if (version >= since) name = candidate;
    return name;
  }

  /** every name this command has gone by, across versions */
  get names(): readonly string[] {
    return this.versions.map(([, name]) => name);
  }
}

/** Command renamed with the `br.` prefix at {@link RENAME_VERSION}. */
const c = (legacy: string, current = legacy): ConsoleCommand =>
  new ConsoleCommand(
    legacy === current
      ? [[0, legacy]]
      : [
          [0, legacy],
          [RENAME_VERSION, current],
        ],
  );

/** Command with explicit per-version names (ascending by version). */
const cv = (versions: [number, string][]): ConsoleCommand =>
  new ConsoleCommand(versions);

/** The raw command table (leaves are version-aware {@link ConsoleCommand}s). */
export const COMMAND_TABLE = {
  Bricks: {
    ActuallyReduce: c('Bricks.ActuallyReduce', 'br.Bricks.ActuallyReduce'),
    Clear: c('Bricks.Clear', 'br.Bricks.Clear'),
    ClearAll: c('Bricks.ClearAll', 'br.Bricks.ClearAll'),
    ClearRegion: c('Bricks.ClearRegion', 'br.Bricks.ClearRegion'),
    Cluster: {
      EnableMergingDynamicGrids: c(
        'Bricks.Cluster.EnableMergingDynamicGrids',
        'br.Bricks.Cluster.EnableMergingDynamicGrids',
      ),
      EnableMergingGlobalGrid: c(
        'Bricks.Cluster.EnableMergingGlobalGrid',
        'br.Bricks.Cluster.EnableMergingGlobalGrid',
      ),
      MaxClusterHalfExtent: c(
        'Bricks.Cluster.MaxClusterHalfExtent',
        'br.Bricks.Cluster.MaxClusterHalfExtent',
      ),
      MaxClusterWeight: c(
        'Bricks.Cluster.MaxClusterWeight',
        'br.Bricks.Cluster.MaxClusterWeight',
      ),
      MaxSplitWeight: c(
        'Bricks.Cluster.MaxSplitWeight',
        'br.Bricks.Cluster.MaxSplitWeight',
      ),
      MinCollapseWeight: c(
        'Bricks.Cluster.MinCollapseWeight',
        'br.Bricks.Cluster.MinCollapseWeight',
      ),
      MinMergeThreshold: c(
        'Bricks.Cluster.MinMergeThreshold',
        'br.Bricks.Cluster.MinMergeThreshold',
      ),
      MinRootHalfExtent: c(
        'Bricks.Cluster.MinRootHalfExtent',
        'br.Bricks.Cluster.MinRootHalfExtent',
      ),
    },
    ClusterMesh: {
      CardCaching: c(
        'Bricks.ClusterMesh.CardCaching',
        'br.Bricks.ClusterMesh.CardCaching',
      ),
      DrawDistance: c(
        'Bricks.ClusterMesh.DrawDistance',
        'br.Bricks.ClusterMesh.DrawDistance',
      ),
      Hysteresis: c(
        'Bricks.ClusterMesh.Hysteresis',
        'br.Bricks.ClusterMesh.Hysteresis',
      ),
      Lod0KeepBias: c(
        'Bricks.ClusterMesh.Lod0KeepBias',
        'br.Bricks.ClusterMesh.Lod0KeepBias',
      ),
      MaxTransitionsPerFrame: c(
        'Bricks.ClusterMesh.MaxTransitionsPerFrame',
        'br.Bricks.ClusterMesh.MaxTransitionsPerFrame',
      ),
      MemoryBudgetBucketSize: c(
        'Bricks.ClusterMesh.MemoryBudgetBucketSize',
        'br.Bricks.ClusterMesh.MemoryBudgetBucketSize',
      ),
      MemoryBudgetMB: c(
        'Bricks.ClusterMesh.MemoryBudgetMB',
        'br.Bricks.ClusterMesh.MemoryBudgetMB',
      ),
      Residency: c(
        'Bricks.ClusterMesh.Residency',
        'br.Bricks.ClusterMesh.Residency',
      ),
      ResidencyConeHysteresis: c(
        'Bricks.ClusterMesh.ResidencyConeHysteresis',
        'br.Bricks.ClusterMesh.ResidencyConeHysteresis',
      ),
      ResidencyConeMargin: c(
        'Bricks.ClusterMesh.ResidencyConeMargin',
        'br.Bricks.ClusterMesh.ResidencyConeMargin',
      ),
      ResidencyWideFOV: c(
        'Bricks.ClusterMesh.ResidencyWideFOV',
        'br.Bricks.ClusterMesh.ResidencyWideFOV',
      ),
      ResidencyZoomHysteresisKillRate: c(
        'Bricks.ClusterMesh.ResidencyZoomHysteresisKillRate',
        'br.Bricks.ClusterMesh.ResidencyZoomHysteresisKillRate',
      ),
    },
    DebugSaveFileScreenshots: c(
      'Bricks.DebugSaveFileScreenshots',
      'br.Bricks.DebugSaveFileScreenshots',
    ),
    DisableLoadWiresForLegacySave: c(
      'Bricks.DisableLoadWiresForLegacySave',
      'br.Bricks.DisableLoadWiresForLegacySave',
    ),
    DrawDebugOctree: c('Bricks.DrawDebugOctree', 'br.Bricks.DrawDebugOctree'),
    DumpChunkStats: c('Bricks.DumpChunkStats', 'br.Bricks.DumpChunkStats'),
    DumpCoverageStats: c(
      'Bricks.DumpCoverageStats',
      'br.Bricks.DumpCoverageStats',
    ),
    DumpGeometryStats: c(
      'Bricks.DumpGeometryStats',
      'br.Bricks.DumpGeometryStats',
    ),
    DumpGroupStats: c('Bricks.DumpGroupStats', 'br.Bricks.DumpGroupStats'),
    EnableExtendedSort: c(
      'Bricks.EnableExtendedSort',
      'br.Bricks.EnableExtendedSort',
    ),
    EnableLumenCards: c(
      'Bricks.EnableLumenCards',
      'br.Bricks.EnableLumenCards',
    ),
    ExportModel: c('Bricks.ExportModel', 'br.Bricks.ExportModel'),
    GenerateGates: c('BR.Bricks.GenerateGates'),
    GenerateMathTables: c(
      'Bricks.GenerateMathTables',
      'br.Bricks.GenerateMathTables',
    ),
    GetOctreeStats: c('Bricks.GetOctreeStats', 'br.Bricks.GetOctreeStats'),
    Load: c('Bricks.Load', 'br.Bricks.Load'),
    LoadTemplate: c('Bricks.LoadTemplate'),
    LODScreenSizeScale: c(
      'Bricks.LODScreenSizeScale',
      'br.Bricks.LODScreenSizeScale',
    ),
    LogClusterBuildTime: c(
      'Bricks.LogClusterBuildTime',
      'br.Bricks.LogClusterBuildTime',
    ),
    LogStreamSizes: c('Bricks.LogStreamSizes', 'br.Bricks.LogStreamSizes'),
    MaxChunkClusterEntriesPerTick: c(
      'Bricks.MaxChunkClusterEntriesPerTick',
      'br.Bricks.MaxChunkClusterEntriesPerTick',
    ),
    MaxChunkEntries: c('Bricks.MaxChunkEntries', 'br.Bricks.MaxChunkEntries'),
    MaxChunkUpdatesPerTick: c(
      'Bricks.MaxChunkUpdatesPerTick',
      'br.Bricks.MaxChunkUpdatesPerTick',
    ),
    MaxChunkUpdateTimePerTick: c(
      'Bricks.MaxChunkUpdateTimePerTick',
      'br.Bricks.MaxChunkUpdateTimePerTick',
    ),
    MaxClusterResultsToApplyPerTick: c(
      'Bricks.MaxClusterResultsToApplyPerTick',
      'br.Bricks.MaxClusterResultsToApplyPerTick',
    ),
    MaxSubscribed: c('br.MaxSubscribedBricks', 'br.Bricks.MaxSubscribed'),
    OptimizeVertexCache: c(
      'Bricks.OptimizeVertexCache',
      'br.Bricks.OptimizeVertexCache',
    ),
    PrintOctreeLeafStats: c(
      'Bricks.PrintOctreeLeafStats',
      'br.Bricks.PrintOctreeLeafStats',
    ),
    RebuildClusters: c('Bricks.RebuildClusters', 'br.Bricks.RebuildClusters'),
    RebuildMeshes: c('Bricks.RebuildMeshes', 'br.Bricks.RebuildMeshes'),
    Save: c('Bricks.Save', 'br.Bricks.Save'),
    SaveFileCompressionLevel: c(
      'Bricks.SaveFileCompressionLevel',
      'br.Bricks.SaveFileCompressionLevel',
    ),
    SaveFileReadBrickLimit: c(
      'Bricks.SaveFileReadBrickLimit',
      'br.Bricks.SaveFileReadBrickLimit',
    ),
    SaveFileReadComponentInstanceLimit: c(
      'Bricks.SaveFileReadComponentInstanceLimit',
      'br.Bricks.SaveFileReadComponentInstanceLimit',
    ),
    SaveFileReadComponentTypeLimit: c(
      'Bricks.SaveFileReadComponentTypeLimit',
      'br.Bricks.SaveFileReadComponentTypeLimit',
    ),
    SaveFileReadDimensionLimit: c(
      'Bricks.SaveFileReadDimensionLimit',
      'br.Bricks.SaveFileReadDimensionLimit',
    ),
    SaveFileReadOwnerLimit: c(
      'Bricks.SaveFileReadOwnerLimit',
      'br.Bricks.SaveFileReadOwnerLimit',
    ),
    SaveFileReadSizeLimit: c(
      'Bricks.SaveFileReadSizeLimit',
      'br.Bricks.SaveFileReadSizeLimit',
    ),
    SaveRegion: c('Bricks.SaveRegion', 'br.Bricks.SaveRegion'),
    ValidateMathTables: c(
      'Bricks.ValidateMathTables',
      'br.Bricks.ValidateMathTables',
    ),
    Vehicle: {
      AntiRollScale: c(
        'Bricks.Vehicle.AntiRollScale',
        'br.Bricks.Vehicle.AntiRollScale',
      ),
      ClientFullSim: c(
        'Bricks.Vehicle.ClientFullSim',
        'br.Bricks.Vehicle.ClientFullSim',
      ),
      DebugDraw: c('Bricks.Vehicle.DebugDraw', 'br.Bricks.Vehicle.DebugDraw'),
    },
    WheelEngine: {
      VisualiseTurningCircles: c(
        'Bricks.WheelEngine.VisualiseTurningCircles',
        'br.Bricks.WheelEngine.VisualiseTurningCircles',
      ),
    },
    WipeMirrorTables: c(
      'Bricks.WipeMirrorTables',
      'br.Bricks.WipeMirrorTables',
    ),
  },
  BundleCompressionLevel: c('BR.BundleCompressionLevel'),
  Bundles: {
    AutoCloseDelay: c('Bundles.AutoCloseDelay', 'br.Bundles.AutoCloseDelay'),
  },
  Catalog: {
    ClearCache: c('Catalog.ClearCache', 'br.Catalog.ClearCache'),
    HideBlacklisted: c('Catalog.HideBlacklisted', 'br.Catalog.HideBlacklisted'),
  },
  Chat: {
    Broadcast: c('Chat.Broadcast', 'br.Chat.Broadcast'),
    Command: c('Chat.Command', 'br.Chat.Command'),
    MessageForUnknownCommands: c(
      'Chat.MessageForUnknownCommands',
      'br.Chat.MessageForUnknownCommands',
    ),
    StatusMessage: c('Chat.StatusMessage', 'br.Chat.StatusMessage'),
    Whisper: c('Chat.Whisper', 'br.Chat.Whisper'),
  },
  ComplexityWarning: {
    BrickCount: c(
      'br.BrickCountWarningThreshold',
      'br.ComplexityWarning.BrickCount',
    ),
    FrozenEntityCount: c(
      'br.FrozenEntityCountWarningThreshold',
      'br.ComplexityWarning.FrozenEntityCount',
    ),
    UnfrozenEntityCount: c(
      'br.UnfrozenEntityCountWarningThreshold',
      'br.ComplexityWarning.UnfrozenEntityCount',
    ),
  },
  Debug: {
    CauseEnsure: c('CauseEnsure', 'br.Debug.CauseEnsure'),
    CauseHang: c('CauseHang', 'br.Debug.CauseHang'),
    ChangeBundleOwner: c('BR.Debug.ChangeBundleOwner'),
    Crash: c('Crash', 'br.Debug.Crash'),
    ListBundleOwners: c('BR.Debug.ListBundleOwners'),
    TestMarkdown: c('TestMarkdown', 'br.Debug.TestMarkdown'),
    TestMarkup: c('TestMarkup', 'br.Debug.TestMarkup'),
  },
  DrawDebug: {
    BrickClusters: {
      $: c('BR.DrawDebugBrickClusters', 'br.DrawDebug.BrickClusters'),
      Neighbors: c(
        'BR.DrawDebugBrickClusters.Neighbors',
        'br.DrawDebug.BrickClusters.Neighbors',
      ),
      OctreeBounds: c(
        'BR.DrawDebugBrickClusters.OctreeBounds',
        'br.DrawDebug.BrickClusters.OctreeBounds',
      ),
    },
    BrickClusterSplitTree: c(
      'BR.DrawDebugBrickClusterSplitTree',
      'br.DrawDebug.BrickClusterSplitTree',
    ),
    BrickLumenCards: c(
      'BR.DrawDebugBrickLumenCards',
      'br.DrawDebug.BrickLumenCards',
    ),
    ClientUpdates: c('BR.DrawDebugClientUpdates', 'br.DrawDebug.ClientUpdates'),
    Colliders: {
      $: c('BR.DrawDebugColliders', 'br.DrawDebug.Colliders'),
      DrawCOM: c(
        'BR.DrawDebugColliders.DrawCOM',
        'br.DrawDebug.Colliders.DrawCOM',
      ),
      DrawCustomMass: c(
        'BR.DrawDebugColliders.DrawCustomMass',
        'br.DrawDebug.Colliders.DrawCustomMass',
      ),
    },
    Constraints: c('BR.DrawDebugConstraints', 'br.DrawDebug.Constraints'),
    Entities: {
      $: c('BR.DrawDebugEntities', 'br.DrawDebug.Entities'),
      Boxes: c('BR.DrawDebugEntities.Boxes', 'br.DrawDebug.Entities.Boxes'),
      Dots: c('BR.DrawDebugEntities.Dots', 'br.DrawDebug.Entities.Dots'),
    },
    Lights: {
      $: c('BR.DrawDebugLights', 'br.DrawDebug.Lights'),
      RedThreshold: c(
        'BR.DrawDebugLights.RedThreshold',
        'br.DrawDebug.Lights.RedThreshold',
      ),
    },
    Texts: c('BR.DrawDebugTexts', 'br.DrawDebug.Texts'),
  },
  EnableImgui: c('br.EnableImgui'),
  EOS: {
    AttemptLogin: c('BR.EOS.AttemptLogin'),
    Disable: c('BR.EOS.Disable'),
    SetSocketName: c('BR.EOS.SetSocketName'),
  },
  GPUMappedArray: {
    MinBlocks: c('BR.GPUMappedArray.MinBlocks'),
    ReservedHeadroomBlocks: c('BR.GPUMappedArray.ReservedHeadroomBlocks'),
  },
  Inspector: {
    ShowFloatTest: c('Inspector.ShowFloatTest', 'br.Inspector.ShowFloatTest'),
    ShowGraphics: c('Inspector.ShowGraphics', 'br.Inspector.ShowGraphics'),
  },
  Interview: c('BR.Interview'),
  Iris: {
    EnableMapDeltaSerialization: c('BR.Iris.EnableMapDeltaSerialization'),
  },
  LagIndicator: {
    MinLatency: c('br.LagIndicatorMinLatency', 'br.LagIndicator.MinLatency'),
    MinTimeSincePacket: c(
      'br.LagIndicatorMinTimeSincePacket',
      'br.LagIndicator.MinTimeSincePacket',
    ),
  },
  Lua: {
    Execute: c('Lua.Execute', 'br.Lua.Execute'),
    ExecuteScript: c('Lua.ExecuteScript', 'br.Lua.ExecuteScript'),
  },
  Msgpack: {
    Default: {
      MaxContainerSize: c(
        'msgpack.Default.MaxContainerSize',
        'br.Msgpack.Default.MaxContainerSize',
      ),
      MaxDepth: c('msgpack.Default.MaxDepth', 'br.Msgpack.Default.MaxDepth'),
      MaxEnumValueCount: c(
        'msgpack.Default.MaxEnumValueCount',
        'br.Msgpack.Default.MaxEnumValueCount',
      ),
      MaxFieldCount: c(
        'msgpack.Default.MaxFieldCount',
        'br.Msgpack.Default.MaxFieldCount',
      ),
      MaxFieldNameLength: c(
        'msgpack.Default.MaxFieldNameLength',
        'br.Msgpack.Default.MaxFieldNameLength',
      ),
      MaxFlatArraySize: c(
        'msgpack.Default.MaxFlatArraySize',
        'br.Msgpack.Default.MaxFlatArraySize',
      ),
      MaxNameLength: c(
        'msgpack.Default.MaxNameLength',
        'br.Msgpack.Default.MaxNameLength',
      ),
      MaxStringLength: c(
        'msgpack.Default.MaxStringLength',
        'br.Msgpack.Default.MaxStringLength',
      ),
      MaxTypeCount: c(
        'msgpack.Default.MaxTypeCount',
        'br.Msgpack.Default.MaxTypeCount',
      ),
    },
  },
  NudgePhysicsObject: c('BR.NudgePhysicsObject'),
  Permissions: {
    GrantRole: c('Permissions.GrantRole', 'br.Permissions.GrantRole'),
    RevokeRole: c('Permissions.RevokeRole', 'br.Permissions.RevokeRole'),
    Save: c('Permissions.Save', 'br.Permissions.Save'),
  },
  Physics: {
    ForceFreezeDynamicGrids: c('BR.Physics.ForceFreezeDynamicGrids'),
  },
  Placer: {
    LogRowTests: c('br.Placer.LogRowTests'),
  },
  PlayerParts: {
    UseFastRender: c('br.PlayerParts.UseFastRender'),
  },
  Resizer: {
    LogTests: c('br.Resizer.LogTests'),
  },
  RunHardwareBenchmark: c('BR.RunHardwareBenchmark'),
  Server: {
    Environment: {
      LoadPreset: c(
        'Server.Environment.LoadPreset',
        'br.Server.Environment.LoadPreset',
      ),
      Reset: c('Server.Environment.Reset', 'br.Server.Environment.Reset'),
      SavePreset: c(
        'Server.Environment.SavePreset',
        'br.Server.Environment.SavePreset',
      ),
    },
    GameMode: {
      EndRound: c('Server.GameMode.EndRound', 'br.Server.GameMode.EndRound'),
      NextRound: c('Server.GameMode.NextRound', 'br.Server.GameMode.NextRound'),
      PrintLeaderboard: c(
        'Server.GameMode.PrintLeaderboard',
        'br.Server.GameMode.PrintLeaderboard',
      ),
      Reset: c('Server.GameMode.Reset', 'br.Server.GameMode.Reset'),
    },
    Minigames: {
      Delete: c('Server.Minigames.Delete'),
      List: c('Server.Minigames.List'),
      LoadPreset: c('Server.Minigames.LoadPreset'),
      NextRound: cv([
        [0, 'Server.Minigames.NextRound'],
        [14000, 'Server.GameMode.NextRound'],
        [14349, 'br.Server.GameMode.NextRound'],
      ]),
      Reset: cv([
        [0, 'Server.Minigames.Reset'],
        [14000, 'Server.GameMode.Reset'],
        [14349, 'br.Server.GameMode.Reset'],
      ]),
      SavePreset: c('Server.Minigames.SavePreset'),
    },
    PlayerPositions: c('Server.PlayerPositions', 'br.Server.PlayerPositions'),
    Players: {
      Damage: c('Server.Players.Damage', 'br.Server.Players.Damage'),
      GiveItem: c('Server.Players.GiveItem', 'br.Server.Players.GiveItem'),
      Kill: c('Server.Players.Kill', 'br.Server.Players.Kill'),
      PrintAllLeaderboardValues: c(
        'Server.Players.PrintAllLeaderboardValues',
        'br.Server.Players.PrintAllLeaderboardValues',
      ),
      PrintLeaderboardValue: c(
        'Server.Players.PrintLeaderboardValue',
        'br.Server.Players.PrintLeaderboardValue',
      ),
      RemoveItem: c(
        'Server.Players.RemoveItem',
        'br.Server.Players.RemoveItem',
      ),
      SetLeaderboardValue: c(
        'Server.Players.SetLeaderboardValue',
        'br.Server.Players.SetLeaderboardValue',
      ),
      SetMinigame: c('Server.Players.SetMinigame'),
      SetTeam: c('Server.Players.SetTeam', 'br.Server.Players.SetTeam'),
    },
    Status: c('Server.Status', 'br.Server.Status'),
    Teams: {
      PrintAllLeaderboardValues: c(
        'Server.Teams.PrintAllLeaderboardValues',
        'br.Server.Teams.PrintAllLeaderboardValues',
      ),
      PrintLeaderboardValue: c(
        'Server.Teams.PrintLeaderboardValue',
        'br.Server.Teams.PrintLeaderboardValue',
      ),
    },
  },
  Text: {
    FlushRecoveryFrames: c('br.Text.FlushRecoveryFrames'),
    MaxCharsPolledPerFrame: c('br.Text.MaxCharsPolledPerFrame'),
    MaxCharsShapedPerFrame: c('br.Text.MaxCharsShapedPerFrame'),
  },
  Thumbnails: {
    WipeCache: c('BR.Thumbnails.WipeCache'),
  },
  Voice: {
    DebugDecode: c('voice.DebugDecode', 'br.Voice.DebugDecode'),
    SyntheticInput: c('voice.SyntheticInput', 'br.Voice.SyntheticInput'),
    TestJitter: c('voice.TestJitter', 'br.Voice.TestJitter'),
  },
  Weapons: {
    DebugFiringVectors: c(
      'weapons.DebugFiringVectors',
      'br.Weapons.DebugFiringVectors',
    ),
    DebugHitValidation: c(
      'weapons.DebugHitValidation',
      'br.Weapons.DebugHitValidation',
    ),
    EnableHitValidation: c(
      'weapons.EnableHitValidation',
      'br.Weapons.EnableHitValidation',
    ),
    LatencyCompensationDelayMethod: c(
      'weapons.LatencyCompensationDelayMethod',
      'br.Weapons.LatencyCompensationDelayMethod',
    ),
    LatencyCompensationLimit: c(
      'weapons.LatencyCompensationLimit',
      'br.Weapons.LatencyCompensationLimit',
    ),
    LatencyCompensationOffset: c(
      'weapons.LatencyCompensationOffset',
      'br.Weapons.LatencyCompensationOffset',
    ),
    ProjectileClientLatencyCompensationEnabled: c(
      'weapons.ProjectileClientLatencyCompensationEnabled',
      'br.Weapons.ProjectileClientLatencyCompensationEnabled',
    ),
    ProjectileLatencyCompensationEnabled: c(
      'weapons.ProjectileLatencyCompensationEnabled',
      'br.Weapons.ProjectileLatencyCompensationEnabled',
    ),
    ProjectilePredictionEnabled: c(
      'weapons.ProjectilePredictionEnabled',
      'br.Weapons.ProjectilePredictionEnabled',
    ),
  },
  WireFuzzer: {
    ClearBreakpoints: c('BR.WireFuzzer.ClearBreakpoints'),
    ComponentsPerTick: c('BR.WireFuzzer.ComponentsPerTick'),
    DisconnectBeforeConnect: c('BR.WireFuzzer.DisconnectBeforeConnect'),
    GatesPerTick: c('BR.WireFuzzer.GatesPerTick'),
    MaxComponents: c('BR.WireFuzzer.MaxComponents'),
    MaxGates: c('BR.WireFuzzer.MaxGates'),
    MaxWires: c('BR.WireFuzzer.MaxWires'),
    ModificationsPerTick: c('BR.WireFuzzer.ModificationsPerTick'),
    RerouteDuplication: c('BR.WireFuzzer.RerouteDuplication'),
    Start: c('BR.WireFuzzer.Start'),
    StartWithSeed: c('BR.WireFuzzer.StartWithSeed'),
    Stop: c('BR.WireFuzzer.Stop'),
    WiresPerTick: c('BR.WireFuzzer.WiresPerTick'),
  },
  WireGraphViz: c('BR.WireGraphViz'),
  WireRenderer: {
    EnablePorts: c('BR.WireRenderer.EnablePorts'),
    EnableWires: c('BR.WireRenderer.EnableWires'),
  },
  World: {
    CreateEmpty: c('BR.World.CreateEmpty'),
    ListRevisions: c('BR.World.ListRevisions'),
    Load: c('BR.World.Load'),
    LoadAdditive: c('BR.World.LoadAdditive'),
    LoadRevision: c('BR.World.LoadRevision'),
    Save: c('BR.World.Save'),
    SaveAs: c('BR.World.SaveAs'),
  },
  WorldSerializer: {
    LogPrefabLoads: c('BR.WorldSerializer.LogPrefabLoads'),
    RedirectLegacyWheelJoints: c(
      'BR.WorldSerializer.RedirectLegacyWheelJoints',
    ),
    WipeOwnershipOnLoad: c('BR.WorldSerializer.WipeOwnershipOnLoad'),
  },
} satisfies CommandTree;

type CommandTree = { [key: string]: ConsoleCommand | CommandTree };

/** Recursively turn a {@link CommandTree} into resolved command-name strings. */
type Resolved<T> = T extends ConsoleCommand
  ? string
  : { [K in keyof T]: Resolved<T[K]> };

/**
 * Version-resolved console command names, nested by namespace.
 * Every leaf is the command string for the running game version.
 */
export type ConsoleCommands = Resolved<typeof COMMAND_TABLE>;

const resolveTree = (tree: CommandTree, version: number): unknown => {
  const out: Record<string, unknown> = {};
  for (const key in tree) {
    const value = tree[key];
    out[key] =
      value instanceof ConsoleCommand
        ? value.resolve(version)
        : resolveTree(value, version);
  }
  return out;
};

/** Build the resolved {@link ConsoleCommands} map for a game CL version. */
export const resolveConsoleCommands = (version: number): ConsoleCommands =>
  resolveTree(COMMAND_TABLE, version) as ConsoleCommands;

// Reverse lookup: every known command name (lowercased, across all versions)
// -> the command. First write wins so canonical commands keep priority over
// the deprecated aliases injected later in the table.
const COMMAND_LOOKUP = new Map<string, ConsoleCommand>();
const indexTree = (tree: CommandTree): void => {
  for (const key in tree) {
    const value = tree[key];
    if (value instanceof ConsoleCommand) {
      for (const name of value.names) {
        const lower = name.toLowerCase();
        if (!COMMAND_LOOKUP.has(lower)) COMMAND_LOOKUP.set(lower, value);
      }
    } else {
      indexTree(value);
    }
  }
};
indexTree(COMMAND_TABLE);

/**
 * Rewrite a console command line so a stale command name resolves to the name
 * the running game version expects. The first word (up to the first space) is
 * matched case-insensitively against every known command name; if it maps to a
 * command whose version-correct name differs, that word is swapped. Lines that
 * don't start with a known command are returned unchanged.
 */
export const migrateConsoleCommand = (
  line: string,
  version: number,
): string => {
  const space = line.indexOf(' ');
  const head = space === -1 ? line : line.slice(0, space);
  const command = COMMAND_LOOKUP.get(head.toLowerCase());
  if (!command) return line;
  const resolved = command.resolve(version);
  // already a valid name for this version (console names are case-insensitive)
  if (resolved.toLowerCase() === head.toLowerCase()) return line;
  return space === -1 ? resolved : resolved + line.slice(space);
};
