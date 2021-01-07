<style lang="scss">
@import '../css/style';

.plugin-view, .plugin-info {
  @include column-container;

  .scroll-scroller {
    background-color: $br-bg-primary;
  }
}

.plugin-info {

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
}

.option-list {
}

.option-item {
  @include alternate(background-color, $br-bg-secondary, $br-bg-secondary-alt);
  font-size: 20px;
  color: $br-boring-button-fg;
  min-height: 50px;
  overflow: visible;
  white-space: nowrap;
  display: flex;
  align-items: center;

  &.config {
    min-height: 80px;
  }

  .option-name, .option-input {
    margin-left: 8px;
    margin-right: 8px;
  }

  .option-name {
    font-size: 24px;
    font-weight: bold;
    cursor: default;
  }

  .option-input {
    @include column;
    width: 100%;

    .option-label {
      font-weight: bold;
      margin-bottom: 4px;

      .saved-note {
        color: $br-info-normal;
        display: inline-flex;
        align-items: center;
        font-weight: normal;
        font-size: 12px;
        opacity: 0;
        transition: 0.2s ease;

        &.show {
          opacity: 1;
        }
      }
    }

    .option-value {
      @include row;
      justify-content: space-between;

      .reset-button {
        color: white;
        cursor: pointer;
      }
    }
  }

  .option-args {
    display: flex;
    flex-flow: row wrap;

    .option-arg {
      @include center;
      background-color: $br-button-normal;
      height: 16px;
      margin: 4px;
      font-size: 16px;
      padding: 4px 8px;
      border-radius: 16px;
      cursor: default;
      color: white;

      &.required {
        background-color: $br-main-pressed;
      }
    }
  }
}

</style>

<template>
  <div class="plugin-view">
    <br-loader :active="loading" size="huge">Loading Plugin</br-loader>
    <div class="plugin-info">
      <br-scroll v-if="!loading">
        <div class="stats">
          <div class="stat"><b data-tooltip="Plugin name">Name:</b> {{plugin.name}}</div>
          <div class="stat"><b data-tooltip="Plugin creator">Author:</b> {{plugin.documentation && plugin.documentation.author}}</div>
          <div class="stat"><b>Description:</b> {{plugin.documentation && plugin.documentation.description || 'none'}}</div>
          <div class="stat"><b data-tooltip="The folder this plugin runs in">Folder:</b> {{plugin.path}}</div>
          <div class="stat"><b data-tooltip="The type of plugin this is">Format:</b> {{plugin.format}}</div>
          <div class="stat"><b data-tooltip="Number of objects in the plugin's storage">Stored Objects:</b> {{plugin.objCount}}</div>
          <div class="stat"><b data-tooltip="Plugin can be started">Enabled:</b> {{plugin.isEnabled ? 'Yes' : 'No'}}</div>
          <div class="stat"><b data-tooltip="Plugin is running">Loaded:</b> {{plugin.isLoaded ? 'Yes' : 'No'}}</div>
        </div>
        <div class="section-header" data-tooltip="Ways to configure the plugin. Changes take place the next time a plugin is loaded.">
          Configs
        </div>
        <div class="option-list">
          <div class="option-item" v-if="Object.keys(plugin.documentation.config || {}).length === 0">
            <i class="option-name">None</i>
          </div>
          <div v-for="(conf, c) in plugin.documentation.config || {}" class="option-item config">
            <div class="option-input">
              <div class="option-label" :data-tooltip="conf.description">
                {{c}}
                <span :class="['saved-note', {show: showSave[c]}]">
                  SAVED <CheckIcon size="20"/>
                </span>
              </div>
              <div class="option-value">
                <br-input
                  v-if="['string', 'password', 'number'].includes(conf.type)"
                  :type="conf.type"
                  :value="config[c]"
                  @input="value => updateConfig(c, value)"
                />
                <br-list-input
                  v-if="conf.type === 'list'"
                  :options="conf.options"
                  :type="conf.itemType"
                  :value="config[c]"
                  @input="value => updateConfig(c, value)"
                />
                <br-dropdown
                  v-if="conf.type === 'enum'"
                  :options="conf.options"
                  :value="config[c]"
                  @input="value => updateConfig(c, value)"
                />
                <br-toggle
                  v-if="conf.type === 'boolean'"
                  @input="value => updateConfig(c, value)"
                  :value="config[c]"
                />
                <ArrowBackUpIcon
                  v-if="conf.default !== config[c]"
                  @click="updateConfig(c, conf.default)"
                  class="reset-button"
                  data-tooltip="Reset to default value"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="section-header" data-tooltip="Ways to control the plugin">
          Commands
        </div>
        <div class="option-list">
          <div class="option-item" v-if="(plugin.documentation.commands || []).length === 0">
            <i class="option-name">None</i>
          </div>
          <div v-for="c in plugin.documentation.commands || []" class="option-item">
            <div class="option-name" :data-tooltip="c.description">{{c.name}}</div>
            <div class="option-args">
              <div v-for="a in c.args || []"
                :class="['option-arg', { required: a.required }]"
                :data-tooltip="(a.required ? '(required) ' : '') + a.description"
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
        data-tooltip="Start the plugin"
        @click="loadPlugin()"
      >
        <PlayerPlayIcon />
        Load
      </br-button>
      <br-button warn v-if="plugin.isEnabled && plugin.isLoaded"
        data-tooltip="Stop, then start the plugin"
        :disabled="waiting"
        @click="reloadPlugin()"
      >
        <RefreshIcon />
        Reload
      </br-button>
      <span style="flex: 1"/>
      <br-button error v-if="plugin.isEnabled && plugin.isLoaded"
        :disabled="waiting"
        data-tooltip="Stop the plugin"
        @click="unloadPlugin()"
      >
        <PlayerStopIcon />
        Unload
      </br-button>
      <br-button main v-if="!plugin.isEnabled"
        data-tooltip="Allow the plugin to be started"
        :disabled="waiting"
        @click="togglePlugin(true)"
      >
        <PlusIcon />
        Enable
      </br-button>
      <br-button error v-if="plugin.isEnabled && !plugin.isLoaded"
        data-tooltip="Prevent the plugin from being started"
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
import ArrowBackUpIcon from 'vue-tabler-icons/icons/ArrowBackUpIcon';
import CheckIcon from 'vue-tabler-icons/icons/CheckIcon';

import debounce from 'lodash/debounce';

export default {
  components: {
    PlayerPlayIcon, PlayerStopIcon, RefreshIcon, PlusIcon,
    MinusIcon, ArrowBackUpIcon, CheckIcon,
  },
  sockets: {
    plugin([path, info]) {
      if (path === this.plugin.path)
        Object.assign(this.plugin, info);
    },
  },
  methods: {
    saveConfig: debounce(async function() {
      const diff = {};
      for (const c in this.plugin.config) {
        if (this.plugin.config[c] !== this.config[c])
          diff[c] = true;
      }
      const config = this.config;
      const ok = await this.$$request('plugin.config', this.$route.params.id, config);
      if (ok) {
        this.showSave = diff;
        setTimeout(() => {
          this.showSave = {};
          this.plugin.config = config;
        }, 1000);
      }
    }, 2000),
    updateConfig(key, val) {
      // update the object
      this.config = {...this.config, [key]: val};
      // save the config
      this.saveConfig();
    },
    async getPlugin() {
      this.loading = true;
      this.plugin = await this.$$request('plugin.get', this.$route.params.id) || {};
      if (this.plugin)
        this.config = this.plugin.config;
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
      config: {},
      showSave: {},
      loading: true,
      waiting: false,
    };
  },
};

</script>
