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
    <nav-header title="Server">
    </nav-header>
    <page-content>
      <side-nav :active="$route.name"/>
      <div class="generic-container server-container">
        <br-header>Server Status: {{starting ? 'starting' : stopping ? 'stopping' : started ? 'started' : 'stopped'}}</br-header>
        <div class="buttons">
          <br-button
            main
            data-tooltip="Start the server"
            :disabled="starting || stopping || loading || started"
            @click="start()">
            <PlayerPlayIcon/>
            Start
          </br-button>
          <br-button
            error
            data-tooltip="Stop the server"
            :disabled="starting || stopping || loading || !started"
            @click="stop()">
            <PlayerStopIcon/>
            Stop
          </br-button>
          <br-button
            warn
            data-tooltip="Stop the server if it's running, then start the server"
            :disabled="starting || stopping || loading"
            @click="restart()">
            <RefreshIcon/>
            Restart
          </br-button>
        </div>
        <br-dimmer :visible="showConfirm">
          <br-modal visible>
            <br-header>
              Confirmation
            </br-header>
            <br-popout-content>
              <p>
                Are you sure you want to {{message}}?
              </p>
            </br-popout-content>
            <br-footer>
              <br-button main
                @click="resolve(true)"
              >
                <CheckIcon />
                Yes
              </br-button>
              <div style="flex: 1" />
              <br-button warn
                @click="resolve(false)"
              >
                <XIcon/>No
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
  destroyed () {
  },
  mounted() {
  },
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
    async getStatus() {
      this.$$emit('subscribe', 'server');
      this.loading = true;
      const { started, starting, stopping } = await this.$$request('server.started');
      this.started = started;
      this.starting = starting;
      this.stopping = stopping;
      this.loading = false;
    },
  },
  sockets: {
    // watch server status
    status({started, starting, stopping}) {
      this.started = started;
      this.starting = starting;
      this.stopping = stopping;
      this.loading = false;
    },
    connect() {
      this.getStatus();
    },
  },
  computed: {
  },
  data() {
    return {
      loading: true,
      started: false,
      starting: false,
      stopping: false,
      message: '',
      showConfirm: false,
      resolve: undefined,
    };
  },
};

</script>
