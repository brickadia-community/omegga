import Vue from 'vue';

import './components';
import Auth from './views/Auth.vue';

Vue.prototype.omeggaData = {};

new Vue({
  el: '#app',
  data() {
    return {};
  },
  render(h) {
    return h(Auth);
  },
});
