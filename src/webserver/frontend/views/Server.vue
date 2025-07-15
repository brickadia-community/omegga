<style lang="scss" scoped>
@import '../css/style';

.server-container {
  display: flex;
  align-items: stretch;
  flex-direction: column;
}

.buttons {
  flex-direction: row;
  display: flex;
  margin-top: 8px;
}
</style>

<template>
  <page>
    <nav-header title="Server"> </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
      <div class="generic-container server-container">
        <br-header
          >Server Status:
          {{
            starting
              ? 'starting'
              : stopping
              ? 'stopping'
              : started
              ? 'started'
              : 'stopped'
          }}</br-header
        >
        <div class="buttons">
          <br-button
            main
            data-tooltip="Start the server"
            :disabled="starting || stopping || loading || started"
            @click="start()"
          >
            <PlayerPlayIcon />
            Start
          </br-button>
          <br-button
            error
            data-tooltip="Stop the server"
            :disabled="starting || stopping || loading || !started"
            @click="stop()"
          >
            <PlayerStopIcon />
            Stop
          </br-button>
          <br-button
            warn
            data-tooltip="Stop the server if it's running, then start the server. Saves minigames/environment/bricks if enabled below."
            :disabled="starting || stopping || loading"
            @click="restart()"
          >
            <RefreshIcon />
            Restart
          </br-button>
        </div>
        <br-header style="margin-top: 8px">Auto Restart</br-header>
        <div class="inputs-list">
          <div
            class="inputs-item"
            data-tooltip="How many hours before restarting regardless of online players"
          >
            <label>Max Server Uptime (Hours)</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="maxUptimeEnabled"
                @input="sendConfig"
              />
              <br-input
                type="number"
                placeholder="Hours"
                tooltip="Uptime Hours"
                v-model="maxUptime"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="How many hours before restarting when no players are online"
          >
            <label>Empty Server Lifetime (Hours)</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="emptyUptimeEnabled"
                @input="sendConfig"
              />
              <br-input
                type="number"
                placeholder="Hours"
                tooltip="Uptime Hours"
                v-model="emptyUptime"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="Restart every day at a certain hour"
          >
            <label>Daily at a Specific Hour</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="dailyHourEnabled"
                @input="sendConfig"
              />
              <br-input
                type="number"
                placeholder="Hour"
                tooltip="Hour (0 = 12am, 13 = 1pm)"
                v-model="dailyHour"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="When enabled, announces auto restart"
          >
            <label>Restart Announcement</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="announcementEnabled"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="When enabled, reconnects players at their previous positions"
          >
            <label>Reload Players</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="playersEnabled"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="When enabled, saves and re-loads bricks on autorestart"
          >
            <label>Reload Bricks</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="bricksEnabled"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="When enabled, saves and re-loads minigames on autorestart"
          >
            <label>Reload Minigames</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="minigamesEnabled"
                @input="sendConfig"
              />
            </div>
          </div>
          <div
            class="inputs-item"
            data-tooltip="When enabled, saves and re-loads environment on autorestart"
          >
            <label>Reload Environment</label>
            <div class="inputs">
              <br-toggle
                tooltip="Enabled"
                v-model="environmentEnabled"
                @input="sendConfig"
              />
            </div>
          </div>
        </div>
        <br-dimmer :visible="showConfirm">
          <br-modal visible>
            <br-header> Confirmation </br-header>
            <br-popout-content>
              <p>Are you sure you want to {{ message }}?</p>
            </br-popout-content>
            <br-footer>
              <br-button main @click="resolve(true)">
                <CheckIcon />
                Yes
              </br-button>
              <div style="flex: 1" />
              <br-button normal @click="resolve(false)">
                <XIcon />No
              </br-button>
            </br-footer>
          </br-modal>
        </br-dimmer>
      </div>
    </page-content>
  </page>
</template>

<script>
import PlayerStopIcon from 'vue-tabler-icons/icons/PlayerStopIcon';
import PlayerPlayIcon from 'vue-tabler-icons/icons/PlayerPlayIcon';
import RefreshIcon from 'vue-tabler-icons/icons/RefreshIcon';
import XIcon from 'vue-tabler-icons/icons/XIcon';
import CheckIcon from 'vue-tabler-icons/icons/CheckIcon';

export default {
  components: { PlayerStopIcon, PlayerPlayIcon, RefreshIcon, CheckIcon, XIcon },
  created() {
    this.getStatus();
  },
  beforeDestroy() {
    this.$$emit('unsubscribe', 'server');
  },
  destroyed() {},
  mounted() {},
  methods: {
    async start() {
      if (!(await this.prompt('start the server'))) return;
      this.$$request('server.start');
    },
    async stop() {
      if (!(await this.prompt('stop the server'))) return;
      this.$$request('server.stop');
    },
    async restart() {
      if (!(await this.prompt('restart the server'))) return;
      this.loading = true;
      this.$$request('server.restart');
    },
    async prompt(message) {
      this.showConfirm = true;
      this.message = message;
      return await new Promise(resolve => {
        this.resolve = val => {
          this.showConfirm = false;
          resolve(val);
        };
      });
    },
    sendConfig() {
      const config = {
        type: 'autoRestartConfig',
        maxUptime: Math.round(Math.max(1, Math.min(this.maxUptime, 168))),
        maxUptimeEnabled: this.maxUptimeEnabled,
        emptyUptime: Math.round(Math.max(1, Math.min(this.emptyUptime, 168))),
        emptyUptimeEnabled: this.emptyUptimeEnabled,
        dailyHour: Math.round(Math.max(0, Math.min(this.dailyHour, 23))),
        dailyHourEnabled: this.dailyHourEnabled,
        announcementEnabled: this.announcementEnabled,
        bricksEnabled: this.bricksEnabled,
        playersEnabled: this.playersEnabled,
        minigamesEnabled: this.minigamesEnabled,
        environmentEnabled: this.environmentEnabled,
      };
      this.$$notify('server.autorestart.set', config);
      this.$forceUpdate();
    },
    async getStatus() {
      this.$$emit('subscribe', 'server');
      this.loading = true;
      const { started, starting, stopping } = await this.$$request(
        'server.started'
      );
      this.started = started;
      this.starting = starting;
      this.stopping = stopping;
      const config = await this.$$request('server.autorestart.get');
      for (const key in config) {
        if (key in this) {
          this[key] = config[key];
        }
      }
      this.loading = false;
    },
  },
  sockets: {
    // watch server status
    status({ started, starting, stopping }) {
      this.started = started;
      this.starting = starting;
      this.stopping = stopping;
      this.loading = false;
    },
    connect() {
      this.getStatus();
    },
  },
  computed: {},
  data() {
    return {
      loading: true,
      started: false,
      starting: false,
      stopping: false,
      message: '',
      showConfirm: false,
      resolve: undefined,

      maxUptime: 48,
      maxUptimeEnabled: false,
      emptyUptime: 24,
      emptyUptimeEnabled: false,
      dailyHour: 2,
      dailyHourEnabled: false,
      announcementEnabled: true,
      bricksEnabled: true,
      playersEnabled: true,
      minigamesEnabled: true,
      environmentEnabled: true,
    };
  },
};
</script>
