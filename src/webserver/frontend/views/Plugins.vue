<style lang="scss" scoped>
@import '../css/style';

.plugins-container {
  display: flex;
  align-items: stretch;
}

.plugins-list-container, .plugin-inspector-container {
  @include column-container;
}

.plugins-list-container {
  margin-right: 16px;

  .input {
    max-width: 300px;
    margin-right: 8px;
    flex: 1;
    width: 100%;
  }
}

.plugins-list {
  @include column-container;
  margin-top: 8px;

  .plugin-item {
    background-color: $br-button-normal;
    margin-bottom: 8px;
    margin-right: 8px;
    display: flex;
    align-items: center;
    height: 48px;
    font-size: 20px;
    color: white;
    cursor: pointer;
    font-weight: bold;
    text-decoration: none;

    &:hover, .router-link-active { background-color: $br-element-hover; }
    &:active, &.disabled { background-color: $br-element-pressed; }

    .icon {
      @include center;
      height: 32px;
      width: 32px;
      margin-left: 8px;
      margin-right: 8px;

      &.running { background-color: $br-main-normal; }
      &.bugged { background-color: $br-warn-normal; }
      &.broken { background-color: $br-error-normal; }
      &.disabled { background-color: $br-bg-primary; }
    }
  }
}


.plugin-inspector {
  @include column;
  background-color: $br-element-popout-bg;
  flex: 1;
  position: relative;
}

@media screen and (max-width: 600px) {

}

</style>

<template>
  <page>
    <nav-header title="Plugins">
      <span style="flex: 1"/>
      <br-button warn
        :disabled="reloading"
        @click="reloadPlugins"
        data-tooltip="Reload all plugins, this may clear current plugin progress"
      >
        <RefreshAlertIcon />
        Reload Plugins
      </br-button>
    </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
      <div class="generic-container plugins-container">
        <div class="plugins-list-container">
          <br-navbar>
            <br-input placeholder="Search Plugins..." v-model="search" />
            <span style="flex: 1"/>
            <br-button icon normal
              data-tooltip="Refresh plugin list"
              @click="getPlugins"
            >
              <RotateIcon />
            </br-button>
          </br-navbar>
          <div class="plugins-list">
            <br-scroll>
              <div is="router-link" v-for="plugin in plugins"
                v-if="matches(plugin)"
                :to="'/plugins/' + plugin.path"
                :key="plugin.path"
                :data-tooltip="plugin.documentation && plugin.documentation.description"
                class="plugin-item"
              >
                <component :is="plugin.icon" :class="[plugin.status]" :data-tooltip="plugin.tooltip" />
                {{plugin.name}}
              </div>
            </br-scroll>
            <br-loader :active="loading" size="huge">Loading Plugins</br-loader>
          </div>
        </div>
        <div class="plugin-inspector-container">
          <br-navbar>
            {{selectedPlugin}}
          </br-navbar>
          <div class="plugin-inspector">
            <router-view :key="$route.params.id" />
          </div>
        </div>
      </div>
    </page-content>
  </page>
</template>

<script>
import RotateIcon from 'vue-tabler-icons/icons/RotateIcon';
import PowerIcon from 'vue-tabler-icons/icons/PowerIcon';
import AlertCircleIcon from 'vue-tabler-icons/icons/AlertCircleIcon';
import BugIcon from 'vue-tabler-icons/icons/BugIcon';
import CircleCheckIcon from 'vue-tabler-icons/icons/CircleCheckIcon';
import RefreshAlertIcon from 'vue-tabler-icons/icons/RefreshAlertIcon';

const updatePluginState = p => {
  p.state = (p.isLoaded ? 2 : 0) + (p.isEnabled ? 1 : 0);
  p.status = [
    'disabled',
    'broken',
    'bugged',
    'running',
  ][p.state];
  p.tooltip = [
    'Plugin is disabled',
    'Plugin is enabled but not running',
    'Plugin is running but not enabled',
    'Plugin is running',
  ][p.state];
  p.icon = [
    'PowerIcon',
    'AlertCircleIcon',
    'BugIcon',
    'CircleCheckIcon',
  ][p.state];
};

export default {
  components: { RotateIcon, PowerIcon, AlertCircleIcon, BugIcon, CircleCheckIcon, RefreshAlertIcon },
  created() {
    this.$$emit('subscribe', 'plugins');
    this.getPlugins();
  },
  beforeDestroy() {
    this.$$emit('unsubscribe', 'plugins');
  },
  methods: {
    matches(p) {
      return p.name.includes(this.search);
    },

    // get a list of plugins, build some ui related info
    async getPlugins() {
      this.loading = true;
      const plugins = await this.$$request('plugins.list');
      this.loading = false;
      for (const p of plugins) {
        updatePluginState(p);
      }
      this.plugins = plugins;
    },

    // reload all plugins
    async reloadPlugins() {
      this.reloading = true;
      await this.$$request('plugins.reload');
      this.reloading = false;
    }
  },
  sockets: {
    plugin([path, info]) {
      const plugin = this.plugins.find(p => p.path === path);
      if (plugin) {
        Object.assign(plugin, info);
        updatePluginState(plugin);
      }
    },
  },
  computed: {
    selectedPlugin() {
      const plugin = this.plugins.find(p => p.path === this.$route.params.id);
      if (plugin) return plugin.name;
      return 'SELECT A PLUGIN';
    }
  },
  data() {
    return {
      search: '',
      loading: true,
      reloading: false,
      plugins: [],
    };
  },
};

</script>
