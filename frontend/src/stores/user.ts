import type { OmeggaSocketData } from '@backend/api';
import { atom } from 'nanostores';

export const $showLogout = atom(false);
export const $user = atom<OmeggaSocketData['user'] | null>(null);
export const $roles = atom<OmeggaSocketData['roles']>([]);
export const $omeggaData = atom<OmeggaSocketData | null>(null);
