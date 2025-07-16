import type { OmeggaLike, OmeggaPlayer, WeaponClass } from '@/plugin';
import { IBrickBounds } from '@util/brick';
import { WriteSaveObject } from 'brs-js';
import { brick as brickUtils, color } from '../util/';

const DEFAULT_PERMS: Record<string, string[]> = {
  moderator: [
    'Bricks.ClearAll',
    'Minigame.AlwaysLeave',
    'Players.Kick',
    'Players.TPInMinigame',
    'Players.TPOthers',
    'Self.Ghost',
  ],
  admin: [
    'Bricks.ClearAll',
    'Bricks.ClearOwn',
    'Bricks.IgnoreTrust',
    'Bricks.Load',
    'Map.Environment',
    'Minigame.AlwaysEdit',
    'Minigame.AlwaysLeave',
    'Minigame.AlwaysSwitchTeam',
    'Minigame.MakeDefault',
    'Minigame.MakePersistent',
    'Minigame.UseAllBricks',
    'Players.Ban',
    'Players.Kick',
    'Players.TPInMinigame',
    'Players.TPOthers',
    'Roles.Grant',
    'Self.Ghost',
    'Server.ChangeRoles',
    'Server.ChangeSettings',
    'Server.FreezeCamera',
    'Tools.Selector.BypassLimits',
    'Tools.Selector.BypassTimeouts',
  ],
};

class Player implements OmeggaPlayer {
  #omegga: OmeggaLike;
  name: string;
  displayName: string;
  id: string;
  controller: string;
  state: string;

  static getRoles(omegga: OmeggaLike, id: string): readonly string[] {
    const data = omegga.getRoleAssignments().savedPlayerRoles[id];
    return Object.freeze(data && data.roles ? data.roles : []);
  }

  static getPermissions(
    omegga: OmeggaLike,
    id: string
  ): Record<string, boolean> {
    const { roles, defaultRole } = omegga.getRoleSetup();

    // if the player is the host, the player has every permission
    if (omegga.host.id === id) {
      return Object.freeze(
        Object.fromEntries(
          [].concat(
            defaultRole.permissions.map(p => [p.name, true]),
            // sometimes the default role does not have every permission listed
            ...roles.map(r => r.permissions.map(p => [p.name, true]))
          )
        )
      );
    }

    // get the player's roles
    const playerRoles = Player.getRoles(omegga, id).map(r => r.toLowerCase());

    // default player permissions
    const permissions: Record<string, boolean> = {
      'Bricks.ClearAll': false,
      'Bricks.ClearOwn': true,
      'Bricks.Delete': true,
      'Bricks.Edit': true,
      'Bricks.IgnoreTrust': false,
      'Bricks.Paint': true,
      'Bricks.Place': true,
      'BricksItems.Spawn': true,
      'Map.Change': false,
      'Map.Environment': false,
      'Map.SetSpawn': false,
      'Minigame.AlwaysEdit': false,
      'Minigame.AlwaysLeave': false,
      'Minigame.AlwaysSwitchTeam': false,
      'Minigame.Create': true,
      'Minigame.MakePersistent': false,
      'Minigame.UseAllBricks': false,
      'Players.Ban': false,
      'Players.TPInMinigame': false,
      'Players.TPOthers': false,
      'Players.TPSelf': true,
      'Roles.Grant': false,
      'Self.Flashlight': true,
      'Self.Fly': true,
      'Self.FreezeCamera': false,
      'Self.Ghost': false,
      'Self.Sprint': true,
      'Self.Suicide': true,
      'Tools.Selector.Use': true,
    };

    // apply all permissions from default role
    for (const p of defaultRole.permissions) {
      // technically this can never be Unchanged so it's always on enabled or allowed
      permissions[p.name] =
        p.state === 'Unchanged' ? permissions[p.name] : p.state === 'Allowed';
    }

    // loop through all the roles
    for (const role of roles) {
      // ignore ones the player does not have
      if (!playerRoles.includes(role.name.toLowerCase())) continue;

      const defaultPerms = DEFAULT_PERMS[role.name.toLowerCase()] || [];
      // iterate through default permissions
      for (const perm of defaultPerms) {
        // if they are not overriden, set it to true
        if (!role.permissions.find(r => r.name === perm))
          permissions[perm] = true;
      }

      // add all the new permissions the player now has
      for (const p of role.permissions) {
        // permission is disabled on forbidden, persisted on unchanged, and enabled on bEnabled or Allowed
        permissions[p.name] =
          p.state !== 'Forbidden' &&
          (p.state === 'Unchanged'
            ? permissions[p.name]
            : permissions[p.name] || p.state === 'Allowed');
        permissions[p.name] = permissions[p.name];
      }
    }

    return Object.freeze(permissions);
  }

  static kill(omegga: OmeggaLike, target: string | OmeggaPlayer) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (target?.name) omegga.writeln(`Server.Players.Kill "${target?.name}"`);
  }

  static damage(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    amount: number
  ) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (amount === 0) return;
    if (target?.name)
      omegga.writeln(`Server.Players.Damage "${target?.name}" ${amount}`);
  }

  static heal(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    amount: number
  ) {
    if (amount === 0) return;
    Player.damage(omegga, target, -amount);
  }

  static giveItem(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    item: WeaponClass
  ) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (!item) return;
    if (target?.name)
      omegga.writeln(`Server.Players.GiveItem "${target?.name}" ${item}`);
  }

  static takeItem(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    item: WeaponClass
  ) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (!item) return;
    if (target?.name)
      omegga.writeln(`Server.Players.RemoveItem "${target?.name}" ${item}`);
  }

  static setTeam(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    teamIndex: number
  ) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (target?.name)
      omegga.writeln(`Server.Players.SetTeam "${target?.name}" ${teamIndex}`);
  }

  static setMinigame(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    index: number
  ) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (target?.name)
      omegga.writeln(`Server.Players.SetMinigame "${target?.name}" ${index}`);
  }

  static setScore(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    minigameIndex: number,
    score: number
  ) {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (target?.name)
      omegga.writeln(
        `Server.Players.SetLeaderboardValue "${target?.name}" ${minigameIndex} ${score}`
      );
  }

  static async getScore(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    minigameIndex: number
  ): Promise<number> {
    if (typeof target === 'string') target = omegga.getPlayer(target);
    if (target?.name) {
      const name = target?.name;
      const id = target?.id;

      const match = await omegga.addWatcher(
        (line, match) => {
          if (match && match.groups.generator === 'LogConsoleCommands') {
            const test = match.groups.data.match(
              /^(?<uuid>.+) leaderboard value (?<minigame>\d+) = (?<score>-?\d+)$/
            );
            if (!test) return;
            if (test.groups.uuid !== id) return;
            if (Number(test.groups.minigame) !== minigameIndex) return;
            return test;
          }
        },
        {
          timeoutDelay: 1000,
          exec: () =>
            omegga.writeln(
              `Server.Players.PrintLeaderboardValue "${name}" ${minigameIndex}`
            ),
        }
      );
      if (match) return Number(match[0].groups.score);
    }
    return 0;
  }

  /**
   * players are not to be constructed
   * @constructor
   * @param omegga Omegga Instance
   * @param name Player Name
   * @param displayName Player Display Name
   * @param id Player Id
   * @param controller Player Controller
   * @param state Player State
   */
  constructor(
    omegga: OmeggaLike,
    username: string,
    displayName: string,
    id: string,
    controller: string,
    state: string
  ) {
    this.#omegga = omegga;
    this.name = username;
    this.displayName = displayName;
    this.id = id;
    this.controller = controller;
    this.state = state;
  }

  getOmegga(): OmeggaLike {
    return this.#omegga;
  }

  clone(): OmeggaPlayer {
    return new Player(
      this.#omegga,
      this.name,
      this.displayName,
      this.id,
      this.controller,
      this.state
    );
  }

  raw(): [string, string, string, string, string] {
    return [this.name, this.displayName, this.id, this.controller, this.state];
  }

  isHost(): boolean {
    return this.#omegga.host.id === this.id;
  }

  clearBricks(quiet = false) {
    this.#omegga.clearBricks(this.id, quiet);
  }

  getRoles(): readonly string[] {
    return Player.getRoles(this.#omegga, this.id);
  }

  getPermissions(): Record<string, boolean> {
    return Player.getPermissions(this.#omegga, this.id);
  }

  getNameColor(): string {
    const { roles, defaultRole, ownerRoleColor, bOwnerRoleHasColor } =
      this.#omegga.getRoleSetup();

    // host check if host has host color
    if (this.isHost() && bOwnerRoleHasColor)
      return color.rgbToHex(ownerRoleColor);

    // get the player's role
    const playerRoles = this.getRoles().map(r => r.toLowerCase());

    // only if the player actually has roles...
    if (playerRoles.length > 0) {
      // check the role list in reverse for the player's role (highest tier first)
      const found = roles
        .slice()
        .reverse()
        .find(
          role =>
            role.bHasColor && playerRoles.includes(role.name.toLowerCase())
        );

      if (found) return color.rgbToHex(found.color);
    }

    return color.rgbToHex(
      defaultRole.bHasColor
        ? defaultRole.color
        : { r: 255, g: 255, b: 255, a: 255 }
    );
  }

  async getPawn(): Promise<string | null> {
    // given a player controller, match the player's pawn
    const pawnRegExp = new RegExp(
      `^(?<index>\\d+)\\) BP_PlayerController_C .+?PersistentLevel\\.${this.controller}\\.Pawn = .*?(?:BP_FigureV2_C'.+:PersistentLevel\\.)?(?<pawn>BP_FigureV2_C_\\d+|None)'?`
    );

    // wait for the pawn watcher to return a pawn
    const [{ groups: { pawn = null } = {} } = {}] =
      await this.#omegga.watchLogChunk<RegExpMatchArray>(
        'GetAll BP_PlayerController_C Pawn Name=' + this.controller,
        pawnRegExp,
        { first: 'index', timeoutDelay: 500 }
      );

    if (pawn === 'None') return null;

    return pawn;
  }

  async getPosition(): Promise<[number, number, number] | null> {
    // this is here because my text editor had weird syntax highlighting glitches when the other omeggas were replaced with this.#omegga...
    // guess the code is "too new" :egg:
    const omegga = this.#omegga;

    // given a player controller, match the player's pawn
    const pawnRegExp = new RegExp(
      `^(?<index>\\d+)\\) BP_PlayerController_C .+?PersistentLevel\\.${this.controller}\\.Pawn = .*?(?:BP_FigureV2_C'.+:PersistentLevel\\.)?(?<pawn>BP_FigureV2_C_\\d+|None)'?`
    );

    // wait for the pawn watcher to return a pawn
    const [
      {
        groups: { pawn },
      },
    ] = await omegga.watchLogChunk<RegExpMatchArray>(
      'GetAll BP_PlayerController_C Pawn Name=' + this.controller,
      pawnRegExp,
      { first: 'index', timeoutDelay: 100 }
    );

    if (pawn === 'None') return null;

    // given a player's pawn, match the player's position
    const posRegExp = new RegExp(
      `CapsuleComponent .+?PersistentLevel\\.${pawn}\\.CollisionCylinder\\.RelativeLocation = \\(X=(?<x>[\\d\\.-]+),Y=(?<y>[\\d\\.-]+),Z=(?<z>[\\d\\.-]+)\\)`
    );

    // wait for the position promise
    const [
      {
        groups: { x, y, z },
      },
    ] = await omegga.addWatcher(posRegExp, {
      // request the position for this player's pawn
      exec: () =>
        omegga.writeln(
          `GetAll SceneComponent RelativeLocation Name=CollisionCylinder Outer=${pawn}`
        ),
      timeoutDelay: 100,
    });

    // return the player's position as an array of numbers
    return [Number(x), Number(y), Number(z)];
  }

  async getGhostBrick(): Promise<{
    targetGrid: string;
    location: number[];
    orientation: string;
  }> {
    const { controller } = this;

    const previewClass = 'BP_ToolPreviewActor_C';

    const ownerRegExp = new RegExp(
      `^(?<index>\\d+)\\) ${previewClass} (.+):PersistentLevel\\.(?<actor>${previewClass}_\\d+)\.Owner = .*?BP_PlayerController_C'(.+):PersistentLevel\\.(?<controller>BP_PlayerController_C_\\d+)'$`
    );
    const transformParamsRegExp = new RegExp(
      `^(?<index>\\d+)\\) ${previewClass} (.+):PersistentLevel\\.(?<actor>${previewClass}_\\d+)\\.TransformParameters = \\(TargetGrid=("(?<targetGrid>.+)"|None),Location=\\(X=(?<x>.+),Y=(?<y>.+),Z=(?<z>.+)\\),Orientation=(?<orientation>.+)\\)$`
    );

    const [owners, transformParams] = await Promise.all([
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        `GetAll ${previewClass} Owner`,
        ownerRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        `GetAll ${previewClass} TransformParameters`,
        transformParamsRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
    ]);

    // get BrickGridPreviewActor by controller
    const owner = owners.find(owner => owner.groups.controller === controller);

    if (!owner) return;

    const actor = owner.groups.actor;
    // get transform parameters for the found actor
    const transformParameters = transformParams.find(
      transformParameters => transformParameters.groups.actor === actor
    );

    if (!transformParameters) return;

    return {
      targetGrid: transformParameters.groups.targetGrid,
      location: [
        +transformParameters.groups.x,
        +transformParameters.groups.y,
        +transformParameters.groups.z,
      ],
      orientation: transformParameters.groups.orientation,
    };
  }

  async getPaint(): Promise<{
    materialIndex: string;
    materialAlpha: string;
    material: string;
    color: number[];
  }> {
    const { controller } = this;

    const match = await this.#omegga
      .addWatcher<{
        materialIndex: string;
        materialAlpha: string;
        material: string;
        color: number[];
      }>(
        line => {
          // [date][counter]0) BP_PlayerState_C /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482378.ColorSelectionState = (SelectedColor=(B=6,G=73,R=246,A=255),MaterialIndex=3,MaterialAlpha=5)
          const match = line.match(
            /^\[[^\]]+\]\[[^\]]+\]0\) BP_PlayerState_C .+?PersistentLevel\.(?<state>BP_PlayerState_C_\d+)\.ColorSelectionState = \(SelectedColor=\(B=(?<b>\d+),G=(?<g>\d+),R=(?<r>\d+),A=(?<a>\d+)\),MaterialIndex=(?<materialIndex>\d+),MaterialAlpha=(?<materialAlpha>\d+)\)$/
          );
          if (!match) return;
          if (match.groups.state !== this.state) return;
          const colorRaw = [+match.groups.r, +match.groups.g, +match.groups.b];
          return {
            materialIndex: match.groups.materialIndex,
            materialAlpha: match.groups.materialAlpha,
            material:
              brickUtils.BRICK_CONSTANTS.DEFAULT_MATERIALS[
                Number(match.groups.materialIndex)
              ],
            color: colorRaw,
          };
        },
        {
          timeoutDelay: 1000,
          exec: () =>
            this.#omegga.writeln(
              `GetAll BRPlayerState ColorSelectionState Owner=${controller}`
            ),
        }
      )
      .catch(() => null);
    if (!match?.[0]) return;
    return match[0];
  }

  async isCrouched(pawn?: string): Promise<boolean> {
    if (!pawn) pawn = await this.getPawn();

    const reg =
      /(?<index>\d+)\) BP_FigureV2_C .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.bIsCrouched = (?<crouched>True|False)$/;

    const resp = await this.#omegga.watchLogChunk<RegExpMatchArray>(
      'GetAll BP_FigureV2_C bIsCrouched Name=' + pawn,
      reg,
      { first: 'index', timeoutDelay: 500 }
    );

    const me = resp.find(r => r.groups.pawn === pawn);
    if (!me) return false;

    return me.groups.crouched == 'True';
  }

  async isDead(pawn?: string): Promise<boolean> {
    if (!pawn) pawn = await this.getPawn();

    const reg =
      /(?<index>\d+)\) BP_FigureV2_C .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.bIsDead = (?<dead>True|False)$/;

    const resp = await this.#omegga.watchLogChunk<RegExpMatchArray>(
      'GetAll BP_FigureV2_C bIsDead Name=' + pawn,
      reg,
      { first: 'index', timeoutDelay: 500 }
    );

    const me = resp.find(r => r.groups.pawn === pawn);
    if (!me) return true;

    return me.groups.dead == 'True';
  }

  async getTemplateBounds() {
    const { controller } = this;

    const brickTemplateRegExp =
      /^(?<index>\d+)\) Tool_Selector_C (.+):PersistentLevel\.(?<tool>Tool_Selector_C_\d+)\.CurrentTemplate = (.+)Brickadia.BrickBuildingTemplate'(.+)Transient.(?<templateName>BrickBuildingTemplate_\d+)'$/
    const brickTemplateOwnerRegExp =
      /^(?<index>\d+)\) Tool_Selector_C (.+):PersistentLevel\.(?<tool>Tool_Selector_C_\d+)\.Owner = (.+)(?<controller>BP_PlayerController_C_\d+)'$/;
    const minBoundsRegExp =
      /^(?<index>\d+)\) BrickBuildingTemplate (.+)Transient\.(?<templateName>BrickBuildingTemplate_\d+)\.MinBounds = \(X=(?<x>.+),Y=(?<y>.+),Z=(?<z>.+)\)$/;
    const maxBoundsRegExp =
      /^(?<index>\d+)\) BrickBuildingTemplate (.+)Transient\.(?<templateName>BrickBuildingTemplate_\d+)\.MaxBounds = \(X=(?<x>.+),Y=(?<y>.+),Z=(?<z>.+)\)$/;
    const centerRegExp =
      /^(?<index>\d+)\) BrickBuildingTemplate (.+)Transient\.(?<templateName>BrickBuildingTemplate_\d+)\.Center = \(X=(?<x>.+),Y=(?<y>.+),Z=(?<z>.+)\)$/;

    const [templates, owners, minBounds, maxBounds, centers] = await Promise.all([
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        'GetAll Tool_Selector_C CurrentTemplate',
        brickTemplateRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        'GetAll Tool_Selector_C Owner',
        brickTemplateOwnerRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        'GetAll BrickBuildingTemplate MinBounds',
        minBoundsRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        'GetAll BrickBuildingTemplate MaxBounds',
        maxBoundsRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
      this.#omegga.watchLogChunk<RegExpMatchArray>(
        'GetAll BrickBuildingTemplate Center',
        centerRegExp,
        {
          first: 'index',
          timeoutDelay: 2000,
          afterMatchDelay: 100,
        }
      ),
    ]);

    if (
      !templates.length ||
      !owners.length ||
      !minBounds.length ||
      !maxBounds.length ||
      !centers.length
    )
      return;


    // get selector for this controller, we need to handle if there are multiple selectors for the same controller
    const selectors = owners.filter(selectors => selectors.groups.controller === controller)
      .map(selectors => selectors.groups.tool)
      .sort();
    const selector = selectors[0]; // grab the most recently created

    if (!selector) {
      return;
    }

    // template for this selector, we need to handle if there are multiple templates for the same selector and grab the most recent one
    const brickTemplates = templates.filter(template => template.groups.tool === selector)
      .map(template => template.groups.templateName)
      .sort();
    const templateName = brickTemplates[0]; // grab the most recently created


    if (!templateName) {
      return;
    }

    // find all values with matching template name
    const minBound = minBounds.find(
      minBound => minBound.groups.templateName === templateName
    );
    const maxBound = maxBounds.find(
      maxBound => maxBound.groups.templateName === templateName
    );
    const center = centers.find(
      center => center.groups.templateName === templateName
    );

    if (!minBound || !maxBound || !center) return;

    return {
      minBound: [+minBound.groups.x, +minBound.groups.y, +minBound.groups.z],
      maxBound: [+maxBound.groups.x, +maxBound.groups.y, +maxBound.groups.z],
      center: [+center.groups.x, +center.groups.y, +center.groups.z],
    } as IBrickBounds;
  }

  async getTemplateBoundsData() {
    const templateBounds = await this.getTemplateBounds();

    if (!templateBounds) return;

    const saveData = await this.#omegga.getSaveData({
      center: templateBounds.center,
      extent: [
        Math.round(
          (templateBounds.maxBound[0] - templateBounds.minBound[0]) / 2
        ),
        Math.round(
          (templateBounds.maxBound[1] - templateBounds.minBound[1]) / 2
        ),
        Math.round(
          (templateBounds.maxBound[2] - templateBounds.minBound[2]) / 2
        ),
      ],
    });

    if (!saveData) return;

    // filter bricks outside the bounds
    // no longer necessary thanks to Bricks.SaveRegion
    /* saveData.bricks = (saveData.bricks as Brick[]).filter(brick => {
      return brickUtils.checkBounds(
        brick,
        saveData.brick_assets,
        templateBounds
      );
    }) as typeof saveData.bricks; */

    if (saveData.bricks.length > 0) {
      return saveData;
    }

    return undefined;
  }

  loadBricks(saveName: string) {
    this.#omegga.loadBricksOnPlayer(saveName, this);
  }

  async loadSaveData(
    saveData: WriteSaveObject,
    { offX = 0, offY = 0, offZ = 0 } = {}
  ) {
    await this.#omegga.loadSaveDataOnPlayer(saveData, this, {
      offX,
      offY,
      offZ,
    });
  }

  async loadDataAtGhostBrick(
    saveData: WriteSaveObject,
    { rotate = true, offX = 0, offY = 0, offZ = 0, quiet = true } = {}
  ) {
    const ghostBrickData = await this.getGhostBrick();

    if (!ghostBrickData || !saveData) return;

    // get bounds of the bricks
    const bounds = brickUtils.getBounds(saveData);

    if (rotate) {
      const orientation =
        brickUtils.BRICK_CONSTANTS.orientationMap[ghostBrickData.orientation];
      saveData.bricks = saveData.bricks.map(brick =>
        brickUtils.rotate(brick, orientation)
      );
      // rotate bounds, if we dont use the original bounds they are off by 1 sometimes >:(
      bounds.minBound = brickUtils.BRICK_CONSTANTS.translationTable[
        brickUtils.d2o(...orientation)
      ](bounds.minBound);
      bounds.maxBound = brickUtils.BRICK_CONSTANTS.translationTable[
        brickUtils.d2o(...orientation)
      ](bounds.maxBound);
      bounds.center = brickUtils.BRICK_CONSTANTS.translationTable[
        brickUtils.d2o(...orientation)
      ](bounds.center);
    }

    // calculate offset from bricks center to ghost brick center
    const offset = bounds.center.map(
      (center, index) => ghostBrickData.location[index] - center
    );

    // load at offset location
    await this.#omegga.loadSaveData(saveData, {
      offX: offX + offset[0],
      offY: offY + offset[1],
      offZ: offZ + offset[2],
      quiet,
    });
  }

  kill() {
    Player.kill(this.#omegga, this);
  }

  damage(amount: number): void {
    Player.damage(this.#omegga, this, amount);
  }

  heal(amount: number): void {
    Player.heal(this.#omegga, this, amount);
  }

  giveItem(item: WeaponClass): void {
    Player.giveItem(this.#omegga, this, item);
  }

  takeItem(item: WeaponClass): void {
    Player.takeItem(this.#omegga, this, item);
  }

  setTeam(teamIndex: number): void {
    Player.setTeam(this.#omegga, this, teamIndex);
  }

  setMinigame(index: number): void {
    Player.setMinigame(this.#omegga, this, index);
  }

  setScore(minigameIndex: number, score: number): void {
    Player.setScore(this.#omegga, this, minigameIndex, score);
  }

  getScore(minigameIndex: number): Promise<number> {
    return Player.getScore(this.#omegga, this, minigameIndex);
  }
}

global.Player = Player;

export default Player;
