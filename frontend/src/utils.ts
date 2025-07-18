export const logout = () =>
  fetch('/api/v1/logout').then(() => location.reload());

import debounce_ from 'lodash/debounce';
export const debounce = debounce_;

export function heartbeatAgo(mins: number): string {
  if (mins < 60) return mins + ' mins';
  mins /= 60;
  if (mins < 24) return Math.round(mins) + ' hours';
  mins /= 24;
  return Math.round(mins) + ' days';
}

export function duration(ago?: number): string {
  if (typeof ago === 'undefined') return '';
  if (ago < 0) return 'not yet';
  ago /= 1000;

  if (ago < 5) return 'a moment';
  if (ago < 60) return Math.round(ago) + ' secs';
  ago /= 60;
  if (ago < 60) return Math.round(ago) + ' mins';
  ago /= 60;
  if (ago < 24) return Math.round(ago) + ' hours';
  ago /= 24;
  return Math.round(ago) + ' days';
}

export function isoTime(time: string | number) {
  const date = new Date(time);
  const pad = (s: number) => (s + '').padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes()) +
    ':' +
    pad(date.getSeconds())
  );
}

export const isoDate = (time: string) => isoTime(time).split(' ')[0];
