<style lang="scss" scoped>

.main-menu-buttons {
  width: 350px;
  margin-top: -8px;
  margin-right: 8px;
}

@media screen and (max-width: 600px) {
  .main-menu-buttons {
    margin-right: 0;
    width: 100%;
    min-width: 100%;
  }
}

</style>

<template>
  <div class="main-menu-buttons">
    <br-menu-button
      :disabled="false"
      route=""
      name="home"
      data-tooltip="Chat with players, view server status. Main Dashboard"
    >
      <DashboardIcon style="background: #de4f43;" />
      Dashboard
    </br-menu-button>
    <br-menu-button
      :disabled="false"
      route="history"
      data-tooltip="Browse chat history"
    >
      <MessagesIcon style="background: #008bd6;" />
      History
    </br-menu-button>
    <br-menu-button
      :disabled="false"
      route="plugins"
      data-tooltip="Manage, reload, and configure plugins"
    >
      <PlugIcon style="background: #00b35f;"/>
      Plugins
    </br-menu-button>
    <br-menu-button
      :disabled="false"
      route="players"
      data-tooltip="Browse player info and play time"
    >
      <ListIcon style="background: #b3006b;"/>
      Players
    </br-menu-button>
    <br-menu-button
      :disabled="true"
      route="metrics"
      data-tooltip="View statistics and metrics for the server"
    >
      <ChartLineIcon style="background: #00b0bd;"/>
      Metrics
    </br-menu-button>
    <br-menu-button
      :disabled="true"
      route="saves"
      data-tooltip="Browse, create, load, and clear saves"
    >
      <DeviceFloppyIcon style="background: #1ed4d1;"/>
      Saves
    </br-menu-button>
    <br-menu-button
      :disabled="true"
      route="settings"
      data-tooltip="Server management settings and roles"
    >
      <AdjustmentsAltIcon style="background: #c4bb02;"/>
      Settings
    </br-menu-button>
    <br-menu-button
      :disabled="false"
      route="server"
      data-tooltip="Server management"
    >
      <ServerIcon style="background: #453d9c;"/>
      Server
    </br-menu-button>
    <br-menu-button
      :disabled="false"
      route="users"
      data-tooltip="Server users"
    >
      <UsersIcon style="background: #7f0b8a;"/>
      Users
    </br-menu-button>
  </div>
</template>

<script>
import Vue from 'vue';

import DashboardIcon from 'vue-tabler-icons/icons/DashboardIcon';
import MessagesIcon from 'vue-tabler-icons/icons/MessagesIcon';
import PlugIcon from 'vue-tabler-icons/icons/PlugIcon';
import ListIcon from 'vue-tabler-icons/icons/ListIcon';
import UsersIcon from 'vue-tabler-icons/icons/UsersIcon';
import ChartLineIcon from 'vue-tabler-icons/icons/ChartLineIcon';
import DeviceFloppyIcon from 'vue-tabler-icons/icons/DeviceFloppyIcon';
import AdjustmentsAltIcon from 'vue-tabler-icons/icons/AdjustmentsAltIcon';
import ServerIcon from 'vue-tabler-icons/icons/ServerIcon';

export default Vue.component('side-nav', {
  components: { DashboardIcon, MessagesIcon, PlugIcon, UsersIcon, ChartLineIcon,
    DeviceFloppyIcon, AdjustmentsAltIcon, ServerIcon, ListIcon },
  props: ['active'],
});
</script>