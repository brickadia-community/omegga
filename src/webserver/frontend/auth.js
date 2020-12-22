import Vue from 'vue';

import './components';
import Auth from './views/Auth.vue';

new Vue({
  el: '#app',
  data() {
    return {
    };
  },
  render(h) {
    return h(Auth);
  }
});


