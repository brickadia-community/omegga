<style scoped>
@import '../css/theme';

.status-widget {
  display: flex;
  flex: 1;
  flex-direction: column;
  position: relative;
  align-items: stretch;
  max-width: 100%;
}

.status-widget .players {
  flex: 1;
  position: relative;
}

.players-parent {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
}

.players-child {
  display: flex;
  flex-direction: column;
}

.chat-widget .footer {
}

.stat {
  color: white;
  font-weight: bold;
}

.stats {
  margin: 8px;
  font-size: 24px;
  word-break: break-all;
}

.stat b {
  color: $br-boring-button-fg;
}

.players table {
  font-weight: bold;
  border-collapse: collapse;
  font-size: 24px;
}

.players table thead th {
  color: white;
  height: 50px;
  background-color: $br-bg-primary;
}

.players table thead th, .players table td,  {
  padding: 0 10px;
}

.players tr :first-child {
  padding-left: 20px;
}
.players tr :last-child {
  padding-right: 20px;
}

.player-row td {
  font-size: 20px;
  background-color: $br-bg-secondary;
  color: $br-boring-button-fg;
  height: 50px;
  overflow: hidden;
  white-space: nowrap;
}
.player-row:nth-child(even) td {
  background-color: $br-bg-secondary-alt;
}

</style>

<template>
  <div class="status-widget">
    <div class="players">
      <div class="players-parent" v-if="status.players">
        <div class="players-child">
          <div class="stats">
            <div class="stat"><b>Name:</b> {{status.serverName}}</div>
            <div class="stat"><b>Uptime:</b> {{duration(status.time)}}</div>
            <div class="stat"><b>Bricks:</b> {{status.bricks}}</div>
            <div class="stat"><b>Players:</b> {{status.players.length}}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left; width: 100%">Name</th>
                <th>Time</th>
                <th>Ping</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="player in status.players" class="player-row">
                <td>{{player.name}}</td>
                <td style="text-align: right;">{{duration(player.time)}}</td>
                <td style="text-align: right;">{{player.ping}}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <br-loader :active="!status.players" blur size="huge">Loading Status</br-loader>
    </div>
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
    duration(ago) {
      ago /= 1000;

      if (ago < 5) return 'a moment';
      if (ago < 60) return Math.round(ago) + ' secs';
      ago /= 60;
      if (ago < 60) return Math.round(ago) + ' mins';
      ago /= 60;
      if (ago < 24) return Math.round(ago) + ' hours';
      ago /= 24;
      return Math.round(ago) + ' days';
    },
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
