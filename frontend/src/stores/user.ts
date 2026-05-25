import type { RouterOutputs } from '../trpc';
import { atom } from 'nanostores';

type SessionInfo = RouterOutputs['session']['info'];

export const $showLogout = atom(false);
export const $user = atom<SessionInfo['user'] | null>(null);
export const $omeggaData = atom<SessionInfo | null>(null);
export const $resolvedScopes = atom<Record<string, boolean>>({});
export const $usersRefresh = atom(0);
