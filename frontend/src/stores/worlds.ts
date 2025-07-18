import { atom } from 'nanostores';

export const $nextWorld = atom<string | null>(null);
export const $activeWorld = atom<string | null>(null);
