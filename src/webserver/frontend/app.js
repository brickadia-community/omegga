import Vue from 'vue';
import VueRouter from 'vue-router';
import VueSocketIO from 'vue-socket.io';

import '../../../node_modules/tabler-icons/iconfont/tabler-icons.scss';

Vue.use(VueRouter);
Vue.use(new VueSocketIO({
  connection: io(),
}));

const router = new VueRouter({
  mode: 'history',
  base: '/',
  routes: [
    { name: 'home', path: '/' },
  ]
});

import Home from './views/Home.vue';
import NotFound from './views/NotFound.vue';

new Vue({
  router,
  el: '#app',
  data() {
    return {
      connected: false,
      disconnected: false,
    };
  },
  sockets: {
    connect() {
      console.log('Connected');
      this.connected = true;
      this.disconnected = false;
    },
    disconnect() {
      console.log('Disconnected');
      this.connected = false;
      this.disconnected = true;
    },
  },
  render(h) {
    return h({
      home: Home,
    }[this.$route.name] || NotFound);
  }
});


