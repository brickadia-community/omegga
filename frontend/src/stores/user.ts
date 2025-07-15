import { atom } from 'nanostores';

export type OmeggaSocketData = {
  roles: { type: 'role'; name: string }[];
  version: string;
  canLogOut: boolean;
  now: number;
  userless: boolean;
  user: {
    username: string;
    isOwner: boolean;
    roles: string[];
  };
};

export const $showLogout = atom(false);
export const $user = atom<OmeggaSocketData['user'] | null>(null);
export const $roles = atom<OmeggaSocketData['roles']>([]);
export const $omeggaData = atom<OmeggaSocketData | null>(null);
