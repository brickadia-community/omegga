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
