<style>
@import '../css/theme';

.plugin-view, .plugin-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.plugin-info {
}
.command-list {
}

.command-item {
  font-size: 20px;
  background-color: $br-bg-secondary;
  color: $br-boring-button-fg;
  height: 50px;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.command-item:nth-child(even) {
  background-color: $br-bg-secondary-alt;
}

.command-name {
  font-size: 24px;
  font-weight: bold;
  margin-left: 8px;
  margin-right: 8px;
  cursor: default;
}

.command-args {
  display: flex;
  flex-flow: row-wrap;
}

.plugin-view .scroll-scroller {
  background-color: $br-bg-primary;
}

.command-arg {
  background-color: $br-button-normal;
  height: 16px;
  margin: 4px;
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  color: white;
}

.command-arg.required {
  background-color: $br-main-pressed;
}

</style>

<template>
  <div class="plugin-view">
    <br-loader :active="loading" size="huge">Loading Status</br-loader>
    <div class="plugin-info">
      <div class="stats" v-if="!loading">
        <div class="stat"><b>Name:</b> {{plugin.name}}</div>
        <div class="stat"><b>Author:</b> {{plugin.documentation && plugin.documentation.author}}</div>
        <div class="stat"><b>Description:</b> {{plugin.documentation && plugin.documentation.description || 'none'}}</div>
        <div class="stat"><b data-tooltip="The folder this plugin runs in">Folder:</b> {{plugin.path}}</div>
        <div class="stat"><b data-tooltip="The type of plugin this is">Format:</b> {{plugin.format}}</div>
        <div class="stat"><b data-tooltip="Plugin can be started">Enabled:</b> {{plugin.isEnabled ? 'Yes' : 'No'}}</div>
        <div class="stat"><b data-tooltip="Plugin is running">Loaded:</b> {{plugin.isLoaded ? 'Yes' : 'No'}}</div>
        <div class="stat"><b>Commands:</b> ({{(plugin.documentation.commands || []).length}})</div>
      </div>
      <br-scroll>
        <div class="command-list" v-if="!loading">
          <div v-for="c in plugin.documentation.commands || []" class="command-item">
            <div class="command-name" :data-tooltip="c.description">{{c.name}}</div>
            <div class="command-args">
              <div v-for="a in c.args || []"
                :class="['command-arg', { required: a.required }]"
                :data-tooltip="a.description"
              >
                {{a.name}}
              </div>
            </div>
          </div>
        </div>
      </br-scroll>
    </div>
    <br-footer>
      <br-button main v-if="plugin.isEnabled && !plugin.isLoaded"
        :disabled="waiting"
        @click="loadPlugin()"
      >
        <PlayerPlayIcon />
        Load
      </br-button>
      <br-button warn v-if="plugin.isEnabled && plugin.isLoaded"
        :disabled="waiting"
        @click="reloadPlugin()"
      >
        <RefreshIcon />
        Reload
      </br-button>
      <span style="flex: 1"/>
      <br-button error v-if="plugin.isEnabled && plugin.isLoaded"
        :disabled="waiting"
        @click="unloadPlugin()"
      >
        <PlayerStopIcon />
        Unload
      </br-button>
      <br-button main v-if="!plugin.isEnabled"
        :disabled="waiting"
        @click="togglePlugin(true)"
      >
        <PlusIcon />
        Enable
      </br-button>
      <br-button error v-if="plugin.isEnabled && !plugin.isLoaded"
        :disabled="waiting"
        @click="togglePlugin(false)"
      >
        <MinusIcon />
        Disable
      </br-button>
    </br-footer>
  </div>
</template>
<script>

import Vue from 'vue';

import PlayerPlayIcon from 'vue-tabler-icons/icons/PlayerPlayIcon';
import PlayerStopIcon from 'vue-tabler-icons/icons/PlayerStopIcon';
import RefreshIcon from 'vue-tabler-icons/icons/RefreshIcon';
import PlusIcon from 'vue-tabler-icons/icons/PlusIcon';
import MinusIcon from 'vue-tabler-icons/icons/MinusIcon';

export default {
  components: { PlayerPlayIcon, PlayerStopIcon, RefreshIcon, PlusIcon, MinusIcon },
  sockets: {
    plugin([path, info]) {
      if (path === this.plugin.path)
        Object.assign(this.plugin, info);
    },
  },
  methods: {
    async getPlugin() {
      this.loading = true;
      this.plugin = await this.$$request('plugin.get', this.$route.params.id) || {};
      this.loading = false;
    },
    async unloadPlugin() {
      this.waiting = true;
      await this.$$request('plugin.unload', this.$route.params.id);
      await this.getPlugin();
      this.waiting = false;
    },
    async loadPlugin() {
      this.waiting = true;
      await this.$$request('plugin.load', this.$route.params.id);
      await this.getPlugin();
      this.waiting = false;
    },
    async reloadPlugin() {
      this.waiting = true;
      const ok = await this.$$request('plugin.unload', this.$route.params.id);
      if (ok) {
        await this.$$request('plugin.load', this.$route.params.id);
      }
      await this.getPlugin();
      this.waiting = false;
    },
    async togglePlugin(enabled) {
      this.waiting = true;
      await this.$$request('plugin.toggle', this.$route.params.id, enabled);
      await this.getPlugin();
      this.waiting = false;
    },
  },
  created() {
    this.getPlugin();
  },
  data() {
    return {
      plugin: {},
      loading: true,
      waiting: false,
    };
  },
};

</script>
