<style lang="scss">
@import '../css/style';

.player-view,
.player-info {
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

.player-inspector {
  @include column;
  background-color: $br-element-popout-bg;
  flex: 1;
  position: relative;
}

.popout-inputs {
  & > .input {
    margin-bottom: 0 !important;
  }
  .ban-duration .input {
    margin-right: 0 !important;
  }
}

.popout-content {
  padding: 8px !important;
  padding-top: 0 !important;
}
</style>

<template>
  <div class="player-inspector-container">
    <br-navbar>
      {{ player.name || 'SELECT A PLAYER' }}
      <span style="flex: 1" />
      <span v-if="player">
        <br-button
          warn
          :disabled="banLoading"
          @click="unban()"
          v-if="player.currentBan"
        >
          <BackspaceIcon />
          Unban
        </br-button>
        <br-button
          error
          :disabled="banLoading"
          @click="showBan = true"
          v-else-if="!player.isHost"
        >
          <BanIcon />
          Ban
        </br-button>
      </span>
    </br-navbar>
    <div class="player-inspector">
      <div class="player-view">
        <br-loader :active="loading" size="huge">Loading Player</br-loader>
        <div class="player-info">
          <br-scroll v-if="!loading">
            <div class="stats">
              <div class="stat">
                <b>Profile:</b>
                <a
                  :href="'https://brickadia.com/users/' + player.id"
                  target="_blank"
                >
                  {{ player.name }}
                </a>
              </div>
              <div class="stat">
                <b>Host:</b> {{ player.isHost ? 'Yes' : 'No' }}
              </div>
              <div class="stat">
                <b>Banned:</b>
                <span
                  v-if="player.currentBan && player.currentBan.duration <= 0"
                >
                  Permanent
                </span>
                <span v-else-if="player.currentBan">
                  {{ duration(player.currentBan.remainingTime) }} of
                  {{ duration(player.currentBan.duration) }} remaining
                </span>
                <span v-else> No </span>
              </div>
              <div class="stat">
                <b
                  data-tooltip="Number of status heartbeats this player has been part of"
                  >Time Played:</b
                >
                {{ heartbeatAgo(player.heartbeats) }}
              </div>
              <div class="stat">
                <b data-tooltip="Date player was last seen">Last Seen:</b>
                <span :data-tooltip="new Date(player.lastSeen)">
                  {{ duration(player.seenAgo) }} ago
                </span>
              </div>
              <div class="stat">
                <b data-tooltip="Date player was first seen">First Seen:</b>
                <span :data-tooltip="new Date(player.created)">
                  {{ duration(player.createdAgo) }} ago
                </span>
              </div>
              <div class="stat">
                <b
                  data-tooltip="Number of times this player has visited the server (new visits are registered if the player joins 3 hours after last seen)"
                  >Visits:</b
                >
                {{ player.sessions }}
              </div>
              <div class="stat">
                <b
                  data-tooltip="Number of server instances this player has joined"
                  >Server Visits:</b
                >
                {{ player.instances }}
              </div>
              <div class="stat">
                <b>Bans:</b> {{ player.banHistory.length }}
              </div>
            </div>
            <div class="section-header" data-tooltip="Roles this player has">
              Roles
            </div>
            <div class="option-list">
              <div v-for="r in player.roles" class="option-item" :key="r.name">
                <div class="option-name" :style="{ color: '#' + r.color }">
                  {{ r.name }}
                </div>
              </div>
              <div class="option-item">
                <div class="option-name" style="color: white">Default</div>
              </div>
            </div>
            <!-- <div class="section-header" data-tooltip="Notes for administrators">
          Notes TODO
        </div>
        <div class="option-item" v-if="player.notes.length === 0">
          <i class="option-name">None</i>
        </div> -->
            <div
              class="section-header"
              data-tooltip="Names this player has gone by historically"
            >
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
                  <td>{{ h.name }}</td>
                  <td
                    style="text-align: right"
                    :data-tooltip="new Date(h.date)"
                  >
                    {{ duration(h.ago) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              class="section-header"
              data-tooltip="Times this player has been banned from the server"
            >
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
                  <td class="reason">{{ b.reason }}</td>
                  <td
                    style="text-align: right"
                    :data-tooltip="'Expires ' + new Date(b.expires)"
                  >
                    {{ 0 >= b.duration ? 'Permanent' : duration(b.duration) }}
                  </td>
                  <td>
                    <router-link :to="'/players/' + b.bannerId">{{
                      b.bannerName || 'missing name'
                    }}</router-link>
                  </td>
                  <td
                    style="text-align: right"
                    :data-tooltip="new Date(b.created)"
                  >
                    {{ isoDate(b.created) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              class="section-header"
              data-tooltip="Times this player has been booted from the server"
            >
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
                  <td class="reason">{{ b.reason }}</td>
                  <td>
                    <router-link :to="'/players/' + b.kickerId">{{
                      b.kickerName || 'missing name'
                    }}</router-link>
                  </td>
                  <td
                    style="text-align: right"
                    :data-tooltip="new Date(b.created)"
                  >
                    {{ isoDate(b.created) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </br-scroll>
        </div>
      </div>
    </div>
    <br-dimmer :visible="showBan">
      <br-loader :active="banLoading" size="huge">Banning...</br-loader>
      <br-modal :visible="!banLoading">
        <br-header>
          Ban Player
        </br-header>
        <div class="popout-inputs">
          <br-input placeholder="Reason" type="text" v-model="banReason" />
          <div class="ban-duration" style="display: flex">
            <br-input
              v-if="banUnit !== 'Permanent'"
              placeholder="Duration"
              type="number"
              v-model="banDuration"
            />
            <br-dropdown
              :options="UNIT_OPTIONS"
              :value="banUnit"
              @input="value => (banUnit = value)"
            />
          </div>
        </div>
        <br-popout-content>
          This ban will expire <span style="color: white">{{ expiry }}</span
          >.
        </br-popout-content>
        <br-footer>
          <br-button main error @click="ban()">
            <BanIcon />
            Ban
          </br-button>
          <div style="flex: 1" />
          <br-button normal @click="showBan = false">
            <XIcon />Cancel
          </br-button>
        </br-footer>
      </br-modal>
    </br-dimmer>
  </div>
</template>
<script>
import BackspaceIcon from 'vue-tabler-icons/icons/BackspaceIcon';
import BanIcon from 'vue-tabler-icons/icons/BanIcon';
import XIcon from 'vue-tabler-icons/icons/XIcon';

const UNIT_SCALARS = {
  'Minute(s)': 1,
  'Hour(s)': 60,
  'Day(s)': 24 * 60,
  'Week(s)': 24 * 60 * 7,
  'Month(s)': 24 * 60 * 30,
};

export default {
  components: {
    BanIcon,
    BackspaceIcon,
    XIcon,
  },
  sockets: {},
  computed: {
    expiry() {
      if (this.banUnit === 'Permanent') return 'Never';
      return this.isoTime(
        Date.now() + UNIT_SCALARS[this.banUnit] * this.banDuration
      );
    },
  },
  methods: {
    async getPlayer() {
      this.loading = true;
      this.player =
        (await this.$$request('player.get', this.$route.params.id)) || {};
      if (!this.player) this.$router.push('/players');
      this.loading = false;
    },
    async ban() {
      this.banLoading = true;

      // compute duration in minutes based on units
      const duration =
        this.banUnit === 'Permanent'
          ? -1
          : UNIT_SCALARS[this.banUnit] * this.banDuration;

      try {
        (await this.$$request(
          'player.ban',
          this.$route.params.id,
          duration,
          this.banReason
        )) || {};
      } catch (err) {
        console.error(err);
      }
      this.showBan = false;
      await this.getPlayer();
      this.banLoading = false;
    },
    async unban() {
      this.banLoading = true;
      try {
        (await this.$$request('player.unban', this.$route.params.id)) || {};
      } catch (err) {
        console.error(err);
      }
      await this.getPlayer();
      this.banLoading = false;
    },
  },
  created() {
    this.getPlayer();
  },
  data() {
    return {
      UNIT_OPTIONS: [
        'Permanent',
        'Minute(s)',
        'Hour(s)',
        'Day(s)',
        'Week(s)',
        'Month(s)',
      ],
      player: {},
      showBan: false,
      banReason: '',
      banDuration: 10,
      banUnit: 'Permanent',
      loading: true,
      banLoading: false,
    };
  },
};
</script>
