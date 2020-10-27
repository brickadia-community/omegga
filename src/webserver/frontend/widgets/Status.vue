<style scoped lang="scss">
@import '../css/style';

.status-widget {
  @include column-stretch;
  flex: 1;
  position: relative;
  max-width: 100%;
  background-color: $br-bg-secondary;

  .players {
    .players-child {
      @include column;
    }
  }
}

</style>

<template>
  <div class="status-widget">
    <br-scroll v-if="status.players" class="players">
      <div class="players-child">
        <div class="stats">
          <div class="stat"><b>Name:</b> {{status.serverName}}</div>
          <div class="stat"><b>Uptime:</b> {{duration(status.time)}}</div>
          <div class="stat"><b>Bricks:</b> {{status.bricks}}</div>
          <div class="stat"><b>Players:</b> {{status.players.length}}</div>
        </div>
        <table class="br-table">
          <thead>
            <tr>
              <th style="text-align: left; width: 100%">Name</th>
              <th>Time</th>
              <th>Ping</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="player in status.players">
              <td>{{player.name}}</td>
              <td style="text-align: right;">{{duration(player.time)}}</td>
              <td style="text-align: right;">{{player.ping}}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </br-scroll>
    <br-loader :active="!status.players" blur size="huge">Loading Status</br-loader>
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-status-widget', {
  sockets: {
    'server.status': function (status) {
      this.status = status || {};
      this.updated = Date.now();
    },
    connect() {
      this.getStatus();
    },
  },
  beforeDestroy() {
    this.$$emit('unsubscribe', 'status');
  },
  methods: {
    getStatus() {
      this.$$emit('subscribe', 'status');
      this.$$request('server.status').then(status => {
        this.status = status || {};
        this.updated = Date.now();
      });
    }
  },
  created() {
    this.getStatus();
  },
  data() {
    return {
      status: {},
      updated: 0,
    };
  },
});

</script>
