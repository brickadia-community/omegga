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
Vue.prototype.showLogout = false;

new Vue({
  el: '#app',
  ...Main,
});
