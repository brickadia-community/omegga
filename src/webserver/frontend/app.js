import Vue from 'vue';

import './components/index.js';
import './widgets/tooltip.js';
import './widgets/index.js';
import './partials/index.js';

import Main from './views/Main.vue';

Vue.prototype.logout = () =>
  fetch('/api/v1/logout').then(() => location.reload());

Vue.prototype.user = {};
Vue.prototype.roles = [];
Vue.prototype.userLookup = [];
Vue.prototype.showLogout = false;
Vue.prototype.omeggaData = {};

Vue.prototype.xss = str => str.replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// convert minutes into min/hour/day
Vue.prototype.heartbeatAgo = mins => {
  if (mins < 60) return mins + ' mins';
  mins /= 60;
  if (mins < 24) return Math.round(mins) + ' hours';
  mins /= 24;
  return Math.round(mins) + ' days';
};

// convert ms into sec/min/hour
Vue.prototype.duration = ago => {
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
};

// only date
Vue.prototype.isoDate = time => {
  return Vue.prototype.isoTime(time).split(' ')[0];
};

// date time in semi-iso format
Vue.prototype.isoTime = time => {
  const date = new Date(time);
  const pad = s => (s+'').padStart(2, '0');
  return date.getFullYear() +
    '-' + pad(date.getMonth() + 1) +
    '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) +
    ':' + pad(date.getMinutes()) +
    ':' + pad(date.getSeconds());
};

new Vue({
  el: '#app',
  ...Main,
});
