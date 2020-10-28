<style lang="scss">
@import '../css/style';

.player-view, .player-info {
  @include column-container;

  .scroll-scroller {
    background-color: $br-bg-primary;
  }
}

.player-info {
  position: relative;

  .section-header {
    @include center;
    color: white;
    height: 32px;
    font-size: 24px;
    text-shadow: none;
    font-weight: bold;
    text-align: center;
    background-color: $br-bg-header;
    top: 0;
    position: sticky;
    text-transform: uppercase;
  }

  table {
    width: 100%;
    max-width: 100%;
  }

  table td.reason {
    word-break: break-all;
    white-space: pre-wrap;
    overflow: visible;
    max-width: 300px;
  }
}

</style>

<template>
  <div class="player-view">
    <br-loader :active="loading" size="huge">Loading Player</br-loader>
    <div class="player-info">
      <br-scroll v-if="!loading">
        <div class="stats">
          <div class="stat"><b>Profile:</b> <a
            :href="'https://brickadia.com/users/' + player.id"
            target="_blank"
          >
            {{player.name}}
          </a></div>
          <div class="stat"><b>Host:</b> {{player.isHost ? 'Yes' : 'No'}}</div>
          <div class="stat"><b>Banned:</b>
            <span v-if="player.currentBan">
              {{duration(player.currentBan.remainingTime)}} of {{duration(player.currentBan.duration)}} remaining
            </span>
            <span v-else>
              No
            </span>
          </div>
          <div class="stat"><b data-tooltip="Number of status heartbeats this player has been part of">Time Played:</b> {{heartbeatAgo(player.heartbeats)}}</div>
          <div class="stat"><b data-tooltip="Date player was last seen">Last Seen:</b> <span :data-tooltip="new Date(player.lastSeen)">
            {{duration(player.seenAgo)}} ago
          </span></div>
          <div class="stat"><b data-tooltip="Date player was first seen">First Seen:</b> <span :data-tooltip="new Date(player.created)">
            {{duration(player.createdAgo)}} ago
          </span></div>
          <div class="stat"><b data-tooltip="Number of times this player has visited the server (new visits are registered if the player joins 3 hours after last seen)">Visits:</b> {{player.sessions}}</div>
          <div class="stat"><b data-tooltip="Number of server instances this player has joined">Server Visits:</b> {{player.instances}}</div>
          <div class="stat"><b>Bans:</b> {{player.banHistory.length}}</div>
        </div>
        <div class="section-header" data-tooltip="Roles this player has">
          Roles
        </div>
        <div class="option-list">
          <div v-for="r in player.roles" class="option-item" :key="r.name">
            <div class="option-name" :style="{color: '#' + r.color}">{{r.name}}</div>
          </div>
          <div class="option-item">
            <div class="option-name" style="color: white;">Default</div>
          </div>
        </div>
        <!-- <div class="section-header" data-tooltip="Notes for administrators">
          Notes TODO
        </div>
        <div class="option-item" v-if="player.notes.length === 0">
          <i class="option-name">None</i>
        </div> -->
        <div class="section-header" data-tooltip="Names this player has gone by historically">
          Name History
        </div>
        <table class="br-table">
          <thead>
            <tr>
              <th style="text-align: left; width: 100%">
                <span>Name</span>
              </th>
              <th>First Seen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in player.nameHistory" :key="h.date + h.name">
              <td>{{h.name}}</td>
              <td style="text-align: right;" :data-tooltip="new Date(h.date)">
                {{duration(h.ago)}}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="section-header" data-tooltip="Times this player has been banned from the server">
          Ban History
        </div>
        <table class="br-table">
          <thead>
            <tr>
              <th style="width: 100%; text-align: left">Reason</th>
              <th>Length</th>
              <th>Issuer</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="player.banHistory.length === 0">
              <td colspan="4"><i>None</i></td>
            </tr>
            <tr v-for="b in player.banHistory" :key="b.created">
              <td class="reason">{{b.reason}}</td>
              <td style="text-align: right;"
                :data-tooltip="'Expires ' + new Date(b.expires)"
              >
                {{duration(b.duration)}}
              </td>
              <td><router-link :to="'/players/'+b.bannerId">{{b.bannerName || 'missing name'}}</router-link></td>
              <td style="text-align: right;"
                :data-tooltip="new Date(b.created)"
              >
                {{isoDate(b.created)}}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="section-header" data-tooltip="Times this player has been booted from the server">
          Kick History
        </div>
        <table class="br-table">
          <thead>
            <tr>
              <th style="width: 100%; text-align: left">Reason</th>
              <th>Issuer</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="player.kickHistory.length === 0">
              <td colspan="4"><i>None</i></td>
            </tr>
            <tr v-for="b in player.kickHistory" :key="b.created">
              <td class="reason">{{b.reason}}</td>
              <td><router-link :to="'/players/'+b.kickerId">{{b.kickerName || 'missing name'}}</router-link></td>
              <td style="text-align: right;"
                :data-tooltip="new Date(b.created)"
              >
                {{isoDate(b.created)}}
              </td>
            </tr>
          </tbody>
        </table>
      </br-scroll>
    </div>
  </div>
</template>
<script>

import Vue from 'vue';

import PlayerPlayIcon from 'vue-tabler-icons/icons/PlayerPlayIcon';
import PlayerStopIcon from 'vue-tabler-icons/icons/PlayerStopIcon';
import RefreshIcon from 'vue-tabler-icons/icons/RefreshIcon';
import PlusIcon from 'vue-tabler-icons/icons/PlusIcon';
import MinusIcon from 'vue-tabler-icons/icons/MinusIcon';
import ArrowBackUpIcon from 'vue-tabler-icons/icons/ArrowBackUpIcon';
import CheckIcon from 'vue-tabler-icons/icons/CheckIcon';

import debounce from 'lodash/debounce';

export default {
  components: {
    PlayerPlayIcon, PlayerStopIcon, RefreshIcon, PlusIcon,
    MinusIcon, ArrowBackUpIcon, CheckIcon,
  },
  sockets: {
  },
  methods: {
    async getPlayer() {
      this.loading = true;
      this.player = await this.$$request('player.get', this.$route.params.id) || {};
      if (!this.player)
        this.$router.push('/players');
      this.nameLookup[this.player.id] = this.player.name;
      this.loading = false;
    },
  },
  created() {
    this.getPlayer();
  },
  data() {
    return {
      player: {},
      showSave: {},
      loading: true,
    };
  },
};

</script>
