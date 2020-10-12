import Vue from 'vue';
import VueRouter from 'vue-router';
import VueSocketIO from 'vue-socket.io';
import { JSONRPCServer, JSONRPCClient, JSONRPCServerAndClient } from 'json-rpc-2.0';

import '../../../node_modules/tabler-icons/iconfont/tabler-icons.scss';

import './components/index.js';
import './widgets/tooltip.js';
import './widgets/index.js';

const socket = io();

const server = new JSONRPCServer();
const client = new JSONRPCClient(async data => socket.emit('rpc', data));
const rpc = new JSONRPCServerAndClient(server, client);

Vue.use(VueRouter);
Vue.use(new VueSocketIO({
  connection: socket,
}));

Vue.prototype.$$request = (type, ...args) => rpc.request(type, args);
Vue.prototype.$$notify = (type, ...args) => rpc.notify(type, args);
Vue.prototype.$$emit = (type, ...args) => socket.emit(type, ...args);


const router = new VueRouter({
  mode: 'history',
  base: '/',
  routes: [
    { name: 'home', path: '/' },
  ]
});

import Home from './views/Home.vue';

new Vue({
  router,
  el: '#app',
  data() {
    return {
      connected: false,
      disconnected: false,
    };
  },
  created() {
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
    rpc(data) {
      rpc.receiveAndSend(data);
    },
  },
  render(h) {
    return h(Home);
  }
});
