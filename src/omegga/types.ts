import type { OmeggaPlayer } from '@/plugin';

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
  /** player slots, from the status' `Players (online/max):` line */
  maxPlayers?: number;
  /**
   * every integer-valued line in the status header, keyed by a snake_cased
   * version of its label (`bricks`, `components`, ...). Reported generically so
   * stats the game adds later are available without a parser change.
   */
  stats?: Record<string, number>;
  players: {
    name: string;
    ping: number;
    time: number;
    roles: string[];
    address: string;
    id: string;
  }[];
}

export type IMinigameList = {
  index: number;
  name: string;
  numMembers: number;
  owner: {
    name: string;
    id: string;
  };
}[];

export type IPlayerPositions = {
  player: OmeggaPlayer;
  /** null when the player has no pawn (e.g. spectating) */
  pawn: string | null;
  /** null when the player has no pawn position */
  pos: number[] | null;
  isDead: boolean;
}[];

export type ILogMinigame = {
  name: string;
  ruleset: string;
  index: number;
  members: OmeggaPlayer[];
  teams: {
    name: string;
    team: string;
    color: number[];
    members: OmeggaPlayer[];
  }[];
};

/**
 * The single gamemode that replaced minigames (~CL14000). Owns the teams and
 * the players within them.
 */
export type IGamemode = {
  /** the gamemode name (e.g. "Sandbox") */
  name: string;
  /** the BP_GameStateBase_C object id */
  gamestate: string;
  /** every player across all teams */
  members: OmeggaPlayer[];
  teams: {
    name: string;
    /** the BRGameModeTeam object id */
    team: string;
    /** [r, g, b, a] */
    color: number[];
    members: OmeggaPlayer[];
  }[];
};
