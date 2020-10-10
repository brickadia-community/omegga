import Vue from 'vue';

import '../../../node_modules/tabler-icons/iconfont/tabler-icons.scss';

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


