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
  pawn: string;
  pos: number[];
  isDead: boolean;
}[];

export type ILogMinigame = {
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
