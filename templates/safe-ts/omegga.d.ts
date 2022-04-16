export interface BRColor {
	r: number;
	b: number;
	g: number;
	a: number;
}
export interface BRVector {
	x: number;
	y: number;
	z: number;
}
export interface BRBanListEntry {
	bannerId: string;
	created: string;
	expires: string;
	reason: string;
}
export interface BRBanList {
	banList: Record<string, BRBanListEntry>;
}
export interface BRRolePermission {
	name: string;
	state: "Allowed" | "Unchanged" | "Forbidden";
}
export interface BRRoleSetupEntry {
	name: string;
	permissions: BRRolePermission[];
	color: BRColor;
	bHasColor: boolean;
}
export interface BRRoleSetup {
	roles: BRRoleSetupEntry[];
	defaultRole: BRRoleSetupEntry;
	ownerRoleColor: BRColor;
	bOwnerRoleHasColor: boolean;
	version: string;
}
export interface BRRoleAssignments {
	savedPlayerRoles: Record<string, {
		roles: string[];
	}>;
}
export interface BRPlayerNameCache {
	savedPlayerNames: Record<string, string>;
}
export interface IOmeggaOptions {
	noauth?: boolean;
	noplugin?: boolean;
	noweb?: boolean;
	debug?: boolean;
}
export interface IServerStatus {
	serverName: string;
	description: string;
	bricks: number;
	components: number;
	time: number;
	players: {
		name: string;
		ping: number;
		time: number;
		roles: string[];
		address: string;
		id: string;
	}[];
}
export declare type IMinigameList = {
	index: number;
	name: string;
	numMembers: number;
	owner: {
		name: string;
		id: string;
	};
}[];
export declare type IPlayerPositions = {
	player: OmeggaPlayer;
	pawn: string;
	pos: number[];
	isDead: boolean;
}[];
export declare type ILogMinigame = {
	name: string;
	ruleset: string;
	members: OmeggaPlayer[];
	teams: {
		name: string;
		team: string;
		color: number[];
		members: OmeggaPlayer[];
	}[];
};
export interface BRSBytes extends Uint8Array {
	brsOffset: number;
}
export declare type Modify<T, R> = Omit<T, keyof R> & R;
export declare type Bytes = Uint8Array | BRSBytes;
export declare type Uuid = string;
export declare type UnrealClass = string;
export declare type UnrealObject = string;
export declare type UnrealBoolean = boolean;
export declare type UnrealFloat = number;
export declare type UnrealColor = [
	number,
	number,
	number,
	number
];
export declare type UnrealByte = number;
export declare type UnrealRotator = [
	number,
	number,
	number
];
export declare type UnrealType = UnrealClass | UnrealObject | UnrealBoolean | UnrealFloat | UnrealColor | UnrealByte | UnrealRotator;
export declare type UnrealTypeFromString<T> = T extends "Class" ? UnrealClass : T extends "Object" ? UnrealObject : T extends "Boolean" ? UnrealBoolean : T extends "Float" ? UnrealFloat : T extends "Color" ? UnrealColor : T extends "Byte" ? UnrealByte : T extends "Rotator" ? UnrealRotator : UnrealType;
export interface User {
	id: Uuid;
	name: string;
}
export interface Owner extends User {
	bricks: number;
}
declare enum Direction {
	XPositive = 0,
	XNegative = 1,
	YPositive = 2,
	YNegative = 3,
	ZPositive = 4,
	ZNegative = 5
}
declare enum Rotation {
	Deg0 = 0,
	Deg90 = 1,
	Deg180 = 2,
	Deg270 = 3
}
export declare type ColorRgb = [
	number,
	number,
	number
];
export interface Collision {
	player: boolean;
	weapon: boolean;
	interaction: boolean;
	tool: boolean;
}
export interface AppliedComponent {
	[property: string]: UnrealType;
}
export interface UnknownComponents {
	[component_name: string]: {
		version: number;
		brick_indices?: number[];
		properties: {
			[property: string]: string;
		};
	};
}
export declare type KnownComponents = {
	BCD_SpotLight: {
		version: 1;
		brick_indices?: number[];
		properties: {
			Rotation: "Rotator";
			InnerConeAngle: "Float";
			OuterConeAngle: "Float";
			Brightness: "Float";
			Radius: "Float";
			Color: "Color";
			bUseBrickColor: "Boolean";
			bCastShadows: "Boolean";
		};
	};
	BCD_PointLight: {
		version: 1;
		brick_indices?: number[];
		properties: {
			bMatchBrickShape: "Boolean";
			Brightness: "Float";
			Radius: "Float";
			Color: "Color";
			bUseBrickColor: "Boolean";
			bCastShadows: "Boolean";
		};
	};
	BCD_ItemSpawn: {
		version: 1;
		brick_indices?: number[];
		properties: {
			PickupClass: "Class";
			bPickupEnabled: "Boolean";
			bPickupRespawnOnMinigameReset: "Boolean";
			PickupMinigameResetRespawnDelay: "Float";
			bPickupAutoDisableOnPickup: "Boolean";
			PickupRespawnTime: "Float";
			PickupOffsetDirection: "Byte";
			PickupOffsetDistance: "Float";
			PickupRotation: "Rotator";
			PickupScale: "Float";
			bPickupAnimationEnabled: "Boolean";
			PickupAnimationAxis: "Byte";
			bPickupAnimationAxisLocal: "Boolean";
			PickupSpinSpeed: "Float";
			PickupBobSpeed: "Float";
			PickupBobHeight: "Float";
			PickupAnimationPhase: "Float";
		};
	};
	BCD_Interact: {
		version: 1;
		brick_indices?: number[];
		properties: {
			bPlayInteractSound: "Boolean";
		};
	};
	BCD_AudioEmitter: {
		version: 1;
		brick_indices?: number[];
		properties: {
			AudioDescriptor: "Object";
			VolumeMultiplier: "Float";
			PitchMultiplier: "Float";
			InnerRadius: "Float";
			MaxDistance: "Float";
			bSpatialization: "Boolean";
		};
	};
};
export interface DefinedComponents extends UnknownComponents, Partial<KnownComponents> {
}
export declare type Components<C extends DefinedComponents> = {
	[T in keyof C]: {
		[V in keyof C[T]["properties"]]: UnrealTypeFromString<C[T]["properties"][V]>;
	};
} & {
	[component_name: string]: AppliedComponent;
};
export declare type Vector = [
	number,
	number,
	number
];
export interface BrickV1 {
	asset_name_index: number;
	size: Vector;
	position: Vector;
	direction: Direction;
	rotation: Rotation;
	collision: boolean;
	visibility: boolean;
	color: UnrealColor | number;
}
export interface BrickV2 extends BrickV1 {
	material_index: number;
}
export interface BrickV3 extends BrickV2 {
	owner_index: number;
}
export interface BrickV8 extends BrickV3 {
	components: Components<DefinedComponents>;
}
export declare type BrickV9 = Modify<BrickV8, {
	physical_index: number;
	material_intensity: number;
	color: ColorRgb | number;
}>;
export declare type BrickV10 = Modify<BrickV9, {
	collision: Collision;
}>;
export interface BrsV1 {
	version: 1;
	map: string;
	author: User;
	description: string;
	brick_count: number;
	mods: string[];
	brick_assets: string[];
	colors: UnrealColor[];
	bricks: BrickV1[];
}
export declare type BrsV2 = Modify<BrsV1, {
	version: 2;
	materials: string[];
	bricks: BrickV2[];
}>;
export declare type BrsV3 = Modify<BrsV2, {
	version: 3;
	brick_owners: User[];
	bricks: BrickV3[];
}>;
export declare type BrsV4 = Modify<BrsV3, {
	version: 4;
	save_time: Uint8Array;
}>;
export declare type BrsV8 = Modify<BrsV4, {
	version: 8;
	host: User;
	brick_owners: Owner[];
	preview?: Bytes;
	game_version: number;
	bricks: BrickV8[];
	components: DefinedComponents;
}>;
export declare type BrsV9 = Modify<BrsV8, {
	version: 9;
	physical_materials: string[];
	bricks: BrickV9[];
}>;
export declare type BrsV10 = Modify<BrsV9, {
	version: 10;
	bricks: BrickV10[];
}>;
export declare type ReadSaveObject = BrsV1 | BrsV2 | BrsV3 | BrsV4 | BrsV8 | BrsV9 | BrsV10;
export interface Brick {
	asset_name_index?: number;
	size: Vector;
	position: Vector;
	direction?: Direction;
	rotation?: Rotation;
	collision?: boolean | Partial<Collision>;
	visibility?: boolean;
	material_index?: number;
	physical_index?: number;
	material_intensity?: number;
	color?: ColorRgb | number;
	owner_index?: number;
	components?: Components<DefinedComponents>;
}
export interface WriteSaveObject {
	game_version?: number;
	map?: string;
	description?: string;
	author?: Partial<User>;
	host?: Partial<User>;
	mods?: string[];
	brick_assets?: string[];
	colors?: UnrealColor[];
	materials?: string[];
	brick_owners?: Partial<Owner>[];
	physical_materials?: string[];
	preview?: Bytes;
	bricks: Brick[];
	save_time?: ArrayLike<number>;
	components?: DefinedComponents;
}
export declare type Preset<T extends string, D> = {
	formatVersion?: "1";
	presetVersion?: "1";
	type?: T;
	data?: D;
};
export declare type EnvironmentPreset = Preset<"Environment", {
	groups?: {
		Sky?: {
			timeOfDay?: number;
			timeChangeSpeed?: number;
			sunAngle?: number;
			sunScale?: number;
			sunHorizonScaleMultiplier?: number;
			sunlightColor?: BRColor;
			skyIntensity?: number;
			skyColor?: BRColor;
			moonScale?: number;
			moonlightIntensity?: number;
			moonlightColor?: BRColor;
			starsIntensity?: number;
			starsColor?: BRColor;
			auroraIntensity?: number;
			weatherIntensity?: BRColor;
			rainSnow?: number;
			cloudCoverage?: number;
			cloudSpeedMultiplier?: number;
			precipitationParticleAmount?: number;
			bCloseLightning?: boolean;
			rainVolume?: number;
			closeThunderVolume?: number;
			distantThunderVolume?: number;
			windVolume?: number;
			clearFogDensity?: number;
			cloudyFogDensity?: number;
			clearFogHeightFalloff?: number;
			cloudyFogHeightFalloff?: number;
			fogColor?: BRColor;
		};
		GroundPlate?: {
			variance?: number;
			varianceBrickSize?: number;
			groundColor?: BRColor;
			groundAccentColor?: BRColor;
			isVisible?: boolean;
			bUseStudTexture?: boolean;
		};
		Water?: {
			waterHeight?: number;
			waterAbsorption?: BRVector;
			waterScattering?: BRVector;
			waterFogIntensity?: number;
			waterFogAmbientColor?: BRColor;
			waterFogAmbientScale?: number;
			waterFogScatteringColor?: BRColor;
			waterFogScatteringScale?: number;
		};
		Ambience?: {
			selectedAmbienceTypeInt?: number;
			ambienceVolume?: number;
			reverbEffect?: string;
		};
	};
}>;
export declare type OL = OmeggaLike;
export declare type OP = OmeggaPlugin;
export declare type PC<T extends Record<string, unknown> = Record<string, unknown>> = PluginConfig<T>;
export declare type PS<T extends Record<string, unknown> = Record<string, unknown>> = PluginStore<T>;
export interface BrickBounds {
	minBound: [
		number,
		number,
		number
	];
	maxBound: [
		number,
		number,
		number
	];
	center: [
		number,
		number,
		number
	];
}
/** Created when a player clicks on a brick with an interact component */
export declare type BrickInteraction = {
	/** Brick name from catalog (Turkey Body, 4x Cube) */
	brick_name: string;
	/** Player information, id, name, controller, and pawn */
	player: {
		id: string;
		name: string;
		controller: string;
		pawn: string;
	};
	/** Brick center position */
	position: [
		number,
		number,
		number
	];
};
/** AutoRestart options */
export declare type AutoRestartConfig = {
	players: boolean;
	bricks: boolean;
	minigames: boolean;
	environment: boolean;
	announcement: boolean;
};
export interface OmeggaPlayer {
	/** player name */
	name: string;
	/** player uuid */
	id: string;
	/** player controller id */
	controller: string;
	/** player state id */
	state: string;
	/**
	 * Returns omegga
	 */
	getOmegga(): OmeggaLike;
	/**
	 * Clone a player
	 */
	clone(): OmeggaPlayer;
	/**
	 * Get raw player info (to feed into a constructor)
	 */
	raw(): [
		string,
		string,
		string,
		string
	];
	/**
	 * True if the player is the host
	 */
	isHost(): boolean;
	/**
	 * Clear player's bricks
	 * @param quiet clear bricks quietly
	 */
	clearBricks(quiet?: boolean): void;
	/**
	 * Get player's roles, if any
	 */
	getRoles(): readonly string[];
	/**
	 * Get player's permissions in a map like `{"Bricks.ClearOwn": true, ...}`
	 * @return permissions map
	 */
	getPermissions(): Record<string, boolean>;
	/**
	 * Get player's name color
	 * @return 6 character hex string
	 */
	getNameColor(): string;
	/**
	 * Get the player's pawn
	 * @return pawn
	 */
	getPawn(): Promise<string>;
	/**
	 * Get player's position
	 * @return [x, y, z] coordinates
	 */
	getPosition(): Promise<[
		number,
		number,
		number
	]>;
	/**
	 * Gets a user's ghost brick info (by uuid, name, controller, or player object)
	 * @return ghost brick data
	 */
	getGhostBrick(): Promise<{
		targetGrid: string;
		location: number[];
		orientation: string;
	}>;
	/**
	 * gets a user's paint tool properties
	 */
	getPaint(): Promise<{
		materialIndex: string;
		materialAlpha: string;
		material: string;
		color: number[];
	}>;
	/**
	 * gets whether or not the player is crouching
	 */
	isCrouched(pawn?: string): Promise<boolean>;
	/**
	 * gets whether or not the player is dead
	 */
	isDead(pawn?: string): Promise<boolean>;
	/**
	 * Gets the bounds of the template in the user's clipboard (bounds of original selection box)
	 * @return template bounds
	 */
	getTemplateBounds(): Promise<BrickBounds>;
	/**
	 * Get bricks inside template bounds
	 * @return BRS JS Save Data
	 */
	getTemplateBoundsData(): Promise<ReadSaveObject>;
	/**
	 * Load bricks at ghost brick location
	 * @param saveData save data to load
	 */
	loadDataAtGhostBrick(saveData: WriteSaveObject, options?: {
		rotate?: boolean;
		offX?: number;
		offY?: number;
		offZ?: number;
		quiet?: boolean;
	}): Promise<void>;
	/**
	 * Load bricks on this player's clipboard
	 * @param saveName Save to load
	 */
	loadBricks(saveName: string): void;
	/**
	 * Load bricks on this player's clipboard passing save data
	 * @param saveData save data to load
	 */
	loadSaveData(saveData: WriteSaveObject, options?: {
		rotate?: boolean;
		offX?: number;
		offY?: number;
		offZ?: number;
		quiet?: boolean;
	}): Promise<void>;
	/**
	 * Kills this player
	 */
	kill(): void;
	/**
	 * Damages a player
	 * @param amount Amount to damage
	 */
	damage(amount: number): void;
	/**
	 * Heal this player
	 * @param amount to heal
	 */
	heal(amount: number): void;
	/**
	 * Gives a player an item
	 * @param item Item name (Weapon_Bow)
	 */
	giveItem(item: string): void;
	/**
	 * Removes an item from a player's inventory
	 * @param item Item name (Weapon_Bow)
	 */
	removeItem(item: string): void;
}
export interface StaticPlayer {
	/**
	 * get a player's roles, if any
	 * @param omegga omegga instance
	 * @param id player uuid
	 * @return list of roles
	 */
	getRoles(omegga: OmeggaLike, id: string): readonly string[];
	/**
	 * get a player's permissions in a map like `{"Bricks.ClearOwn": true, ...}`
	 * @param omegga Omegga instance
	 * @param id player uuid
	 * @return permissions map
	 */
	getPermissions(omegga: OmeggaLike, id: string): Record<string, boolean>;
	/**
	 * Kills a player
	 * @param omegga Omegga instance
	 * @param target Player or player name/id
	 */
	kill(omegga: OmeggaLike, target: string | OmeggaPlayer): void;
	/**
	 * Damages a player
	 * @param omegga Omegga instance
	 * @param target Player or player name/id
	 * @param amount Damage amount
	 */
	damage(omegga: OmeggaLike, target: string | OmeggaPlayer, amount: number): void;
	/**
	 * Heal a player
	 * @param omegga Omegga instance
	 * @param target Player or player name/id
	 * @param amount Heal amount
	 */
	heal(omegga: OmeggaLike, target: string | OmeggaPlayer, amount: number): void;
	/**
	 * Gives a player an item
	 * @param omegga Omegga instance
	 * @param target Player or player name/id
	 * @param item Item name (Weapon_Bow)
	 */
	giveItem(omegga: OmeggaLike, target: string | OmeggaPlayer, item: string): void;
	/**
	 * Removes an item from a player's inventory
	 * @param omegga Omegga instance
	 * @param target Player or player name/id
	 * @param item Item name (Weapon_Bow)
	 */
	removeItem(omegga: OmeggaLike, target: string | OmeggaPlayer, item: string): void;
}
export interface InjectedCommands {
	/** Get server status */
	getServerStatus(this: OmeggaLike): Promise<IServerStatus>;
	/** Get a list of minigames and their indices */
	listMinigames(this: OmeggaLike): Promise<IMinigameList>;
	/** Get all player positions and pawns */
	getAllPlayerPositions(this: OmeggaLike): Promise<IPlayerPositions>;
	/** Get minigames and members */
	getMinigames(this: OmeggaLike): Promise<ILogMinigame[]>;
}
export interface MockEventEmitter {
	addListener(event: string, listener: Function): this;
	emit(event: string, ...args: any[]): boolean;
	eventNames(): (string | symbol)[];
	getMaxListeners(): number;
	listenerCount(event: string): number;
	listeners(event: string): Function[];
	off(event: string, listener: Function): this;
	on(event: string, listener: Function): this;
	once(event: string, listener: Function): this;
	prependListener(event: string, listener: Function): this;
	prependOnceListener(event: string, listener: Function): this;
	rawListeners(event: string): Function[];
	removeAllListeners(event?: string): this;
	removeListener(event: string, listener: Function): this;
	setMaxListeners(maxListeners: number): this;
	on(event: "close", listener: () => void): this;
	on(event: "line", listener: (line: string) => void): this;
	on(event: "start", listener: (info: {
		map: string;
	}) => void): this;
	on(event: "version", listener: (version: number) => void): this;
	on(event: "unauthorized", listener: () => void): this;
	on(event: "join", listener: (player: OmeggaPlayer) => void): this;
	on(event: "leave", listener: (player: OmeggaPlayer) => void): this;
	on(event: "chat", listener: (name: string, message: string) => void): this;
	on(event: "mapchange", listener: (info: {
		map: string;
	}) => void): this;
	on(event: "autorestart", listener: (config: AutoRestartConfig) => void): this;
	on(event: "interact", listener: (interaction: BrickInteraction) => void): this;
}
export interface OmeggaLike extends OmeggaCore, LogWrangling, InjectedCommands, MockEventEmitter {
	writeln(line: string): void;
	/** game CL version*/
	version: number;
	/** verbose logging is enabled*/
	verbose: boolean;
	/** list of players */
	players: OmeggaPlayer[];
	/** server host */
	host?: {
		id: string;
		name: string;
	};
	/** server is started */
	started: boolean;
	/** server is starting */
	starting: boolean;
	/** server is stopping */
	stopping: boolean;
	/** current map */
	currentMap: string;
	/** path to config files */
	configPath: string;
	/** path to saves */
	savePath: string;
	/** path to presets */
	presetPath: string;
}
export interface OmeggaCore {
	/**
	 * get a list of players
	 * @return list of players {id: uuid, name: name} objects
	 */
	getPlayers(): {
		id: string;
		name: string;
		controller: string;
		state: string;
	}[];
	/**
	 * find a player by name, id, controller, or state
	 * @param target - name, id, controller, or state
	 */
	getPlayer(target: string): OmeggaPlayer | null;
	/**
	 * find a player by rough name, prioritize exact matches and get fuzzier
	 * @param name player name, fuzzy
	 */
	findPlayerByName(name: string): OmeggaPlayer | null;
	/**
	 * get the host's ID
	 * @return Host Id
	 */
	getHostId(): string;
	/**
	 * broadcast messages to chat
	 * messages are broken by new line
	 * multiple arguments are additional lines
	 * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
	 * @param messages unescaped chat messages to send. may need to wrap messages with quotes
	 */
	broadcast(...messages: string[]): void;
	/**
	 * whisper messages to a player's chat
	 * messages are broken by new line
	 * multiple arguments are additional lines
	 * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
	 * @param target - player identifier or player object
	 * @param messages - unescaped chat messages to send. may need to wrap messages with quotes
	 */
	whisper(target: string | OmeggaPlayer, ...messages: string[]): void;
	/**
	 * prints text to the middle of a player's screen
	 * all messages longer than 512 characters are deleted automatically
	 * @param target - player identifier or player object
	 * @param message - unescaped chat messages to send. may need to wrap messages with quotes
	 */
	middlePrint(target: string | OmeggaPlayer, message: string): void;
	/**
	 * Save a minigame preset based on a minigame index
	 * @param index minigame index
	 * @param name preset name
	 */
	saveMinigame(index: number, name: string): void;
	/**
	 * Delete a minigame
	 * @param index minigame index
	 */
	deleteMinigame(index: number): void;
	/**
	 * Reset a minigame
	 * @param index minigame index
	 */
	resetMinigame(index: number): void;
	/**
	 * Force the next round in a minigame
	 * @param index minigame index
	 */
	nextRoundMinigame(index: number): void;
	/**
	 * Load an Minigame preset
	 * @param presetName preset name
	 * @param owner owner id/name
	 */
	loadMinigame(presetName: string, owner?: string): void;
	/**
	 * Get all presets in the minigame folder and child folders
	 */
	getMinigamePresets(): string[];
	/**
	 * Reset the environment settings
	 */
	resetEnvironment(): void;
	/**
	 * Save an environment preset
	 * @param presetName preset name
	 */
	saveEnvironment(presetName: string): void;
	/**
	 * Load an environment preset
	 * @param presetName preset name
	 */
	loadEnvironment(presetName: string): void;
	/**
	 * Load some environment preset data
	 * @param preset preset data
	 */
	loadEnvironmentData(preset: EnvironmentPreset): void;
	/**
	 * Get all presets in the environment folder and child folders
	 */
	getEnvironmentPresets(): string[];
	/**
	 * Clear a user's bricks (by uuid, name, controller, or player object)
	 * @param target player or player identifier
	 * @param quiet quietly clear bricks
	 */
	clearBricks(target: string | {
		id: string;
	}, quiet?: boolean): void;
	/**
	 * Clear a region of bricks
	 * @param region region to clear
	 * @param options optional settings
	 */
	clearRegion(region: {
		center: [
			number,
			number,
			number
		];
		extent: [
			number,
			number,
			number
		];
	}, options?: {
		target?: string | OmeggaPlayer;
	}): void;
	/**
	 * Clear all bricks on the server
	 * @param quiet quietly clear bricks
	 */
	clearAllBricks(quiet?: boolean): void;
	/**
	 * Save bricks under a filename
	 * @param saveName save file name
	 * @param region region of bricks to save
	 */
	saveBricks(saveName: string, region?: {
		center: [
			number,
			number,
			number
		];
		extent: [
			number,
			number,
			number
		];
	}): void;
	/**
	 * Save bricks under a filename, with a promise
	 * @param saveName save file name
	 * @param region region of bricks to save
	 */
	saveBricksAsync(saveName: string, region?: {
		center: [
			number,
			number,
			number
		];
		extent: [
			number,
			number,
			number
		];
	}): Promise<void>;
	/**
	 * Load bricks on the server
	 */
	loadBricks(saveName: string, options?: {
		offX?: number;
		offY?: number;
		offZ?: number;
		quiet?: boolean;
	}): void;
	/**
	 * Load bricks on the server into a player's clipbaord
	 */
	loadBricksOnPlayer(saveName: string, player: string | OmeggaPlayer, options?: {
		offX?: number;
		offY?: number;
		offZ?: number;
	}): void;
	/**
	 * Get all saves in the save folder and child folders
	 */
	getSaves(): string[];
	/**
	 * Checks if a save exists and returns an absolute path
	 * @param saveName Save filename
	 * @return Path to string
	 */
	getSavePath(saveName: string): string;
	/**
	 * unsafely load save data (wrap in try/catch)
	 * @param saveName save file name
	 * @param saveData BRS JS Save data
	 */
	writeSaveData(saveName: string, saveData: WriteSaveObject): void;
	/**
	 * unsafely read save data (wrap in try/catch)
	 * @param saveName save file name
	 * @param nobricks only read save header data
	 * @return BRS JS Save Data
	 */
	readSaveData(saveName: string, nobricks?: boolean): ReadSaveObject;
	/**
	 * load bricks from save data and resolve when game finishes loading
	 * @param saveData BRS JS Save data
	 */
	loadSaveData(saveData: WriteSaveObject, options?: {
		offX?: number;
		offY?: number;
		offZ?: number;
		quiet?: boolean;
	}): Promise<void>;
	/**
	 * load bricks from save data and resolve when game finishes loading
	 * @param saveData BRS JS Save data
	 * @param player Player name/id or player object
	 */
	loadSaveDataOnPlayer(saveData: WriteSaveObject, player: string | OmeggaPlayer, options?: {
		offX?: number;
		offY?: number;
		offZ?: number;
	}): Promise<void>;
	/**
	 * get current bricks as save data
	 */
	getSaveData(region?: {
		center: [
			number,
			number,
			number
		];
		extent: [
			number,
			number,
			number
		];
	}): Promise<ReadSaveObject>;
	/**
	 * Change server map
	 * @param map Map name
	 */
	changeMap(map: string): Promise<boolean>;
	/**
	 * Get up-to-date role setup from RoleSetup.json
	 */
	getRoleSetup(): BRRoleSetup;
	/**
	 * Get up-to-date role assignments from RoleAssignment.json
	 */
	getRoleAssignments(): BRRoleAssignments;
	/**
	 * Get up-to-date ban list from BanList.json
	 */
	getBanList(): BRBanList;
	/**
	 * Get up-to-date name cache from PlayerNameCache.json
	 */
	getNameCache(): BRPlayerNameCache;
}
/** A simple document store for plugins */
export interface PluginStore<Storage extends Record<string, unknown> = Record<string, unknown>> {
	/** Get a value from plugin storage */
	get<T extends keyof Storage>(key: T): Promise<Storage[T]>;
	/** Set a value to plugin storage */
	set<T extends keyof Storage>(key: T, value: Storage[T]): Promise<void>;
	/** Delete a value from plugin storage */
	delete(key: string): Promise<void>;
	/** Wipe all values in plugin storage */
	wipe(): Promise<void>;
	/** Count entries in plugin storage */
	count(): Promise<number>;
	/** Get a list of keys in plugin storage */
	keys(): Promise<(keyof Storage)[]>;
}
/** A config representative of the config outlined in doc.json */
export declare type PluginConfig<T extends Record<string, unknown> = Record<string, unknown>> = T;
/** An omegga plugin */
export default abstract class OmeggaPlugin<Config extends Record<string, unknown> = Record<string, unknown>, Storage extends Record<string, unknown> = Record<string, unknown>> {
	omegga: OmeggaLike;
	config: PluginConfig<Config>;
	store: PluginStore<Storage>;
	constructor(omegga: OmeggaLike, config: PluginConfig<Config>, store: PluginStore<Storage>);
	/** Run when plugin starts, returns /commands it uses */
	abstract init(): Promise<void | {
		registeredCommands?: string[];
	}>;
	/** Run when plugin is stopped */
	abstract stop(): Promise<void>;
	/** Run when another plugin tries to interact with this plugin
	 * @param event Event name
	 * @param from Name of origin plugin
	 * @return value other plugin expects
	 */
	abstract pluginEvent?(event: string, from: string, ...args: any[]): Promise<unknown>;
}
export interface LogWrangling {
	/** Add a passive pattern on console output that invokes callback on match */
	addMatcher<T>(pattern: IMatcher<T>["pattern"], callback: IMatcher<T>["callback"]): void;
	/** Run an active pattern on console output that resolves a match */
	addWatcher<T = RegExpMatchArray>(pattern: IWatcher<T>["pattern"], options?: {
		timeoutDelay?: number;
		bundle?: boolean;
		debounce?: boolean;
		afterMatchDelay?: number;
		last?: IWatcher<T>["last"];
		exec?: () => void;
	}): Promise<IWatcher<T>["matches"]>;
	/** Run a command and capture bundled output */
	watchLogChunk<T = string>(cmd: string, pattern: IWatcher<T>["pattern"], options?: {
		first?: "index" | ((match: T) => boolean);
		last?: IWatcher<T>["last"];
		afterMatchDelay?: number;
		timeoutDelay?: number;
	}): Promise<IWatcher<T>["matches"]>;
	/** Run a command and capture bundled output for array functions */
	watchLogArray<Item extends Record<string, string> = Record<string, string>, Member extends Record<string, string> = Record<string, string>>(cmd: string, itemPattern: RegExp, memberPattern: RegExp): Promise<{
		item: Item;
		members: Member[];
	}[]>;
}
export declare type WatcherPattern<T> = (line: string, match: RegExpMatchArray) => T | RegExpMatchArray | "[OMEGGA_WATCHER_DONE]";
export declare type IMatcher<T> = {
	pattern: RegExp;
	callback: (match: RegExpMatchArray) => boolean;
} | {
	pattern: (line: string, match: RegExpMatchArray) => T;
	callback: (match: RegExpMatchArray) => T;
};
export declare type IWatcher<T> = {
	bundle: boolean;
	debounce: boolean;
	timeoutDelay: number;
	afterMatchDelay: number;
	last: (match: T) => boolean;
	callback: () => void;
	resolve: (...args: any[]) => void;
	remove: () => void;
	done: () => void;
	timeout: ReturnType<typeof setTimeout>;
} & ({
	pattern: WatcherPattern<T>;
	matches: T[];
} | {
	pattern: RegExp;
	matches: RegExpMatchArray[];
});

export {};
