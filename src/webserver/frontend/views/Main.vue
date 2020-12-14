<template>
  <router-view />
</template>

<script>

import Vue from 'vue';
import VueRouter from 'vue-router';
import VueSocketIO from 'vue-socket.io';
import { JSONRPCServer, JSONRPCClient, JSONRPCServerAndClient } from 'json-rpc-2.0';

import router from '../router.js';

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

export default {
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
    data(data) {
      console.log('data is', data);
      Vue.prototype.user = data.user;
      Vue.prototype.omeggaData = data;
      Vue.prototype.roles = data.roles;
      Vue.prototype.showLogout = data.canLogOut;
      this.loading = false;
    },
    rpc(data) {
      rpc.receiveAndSend(data);
    },
  },
  data() {
    return {
      loading: false,
    };
  },
}
</script>