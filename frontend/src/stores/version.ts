import { atom } from 'nanostores';

export const $version = atom<string | null>(null);
export const $brickadiaVersion = atom<number | null>(null);
