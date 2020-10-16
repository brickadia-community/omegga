import Vue from 'vue';

import './components';
import Auth from './views/Auth.vue';

new Vue({
  el: '#app',
  data() {
    return {
      connected: false,
      disconnected: false,
    };
  },
  render(h) {
    return h(Auth);
  }
});


