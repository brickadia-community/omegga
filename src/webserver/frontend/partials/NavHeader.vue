<style lang="scss" scoped>

.nav-header {
  color: white;
  font-weight: bold;
  font-size: 50px;
  text-transform: uppercase;
}

.main-nav {
  margin-bottom: 16px;
}

</style>

<template>
  <div class="main-nav">
    <header class="nav-header">{{title}}</header>
    <br-navbar>
      <span style="flex: 1; margin-left: 8px">
        Welcome, {{username || user.username}}
      </span>
      <slot />
      <br-button icon error
        v-if="showLogout"
        data-tooltip="Logout of Web UI"
        @click="logout()"
      >
        <LogoutIcon />
      </br-button>
    </br-navbar>
  </div>
</template>

<script>
import Vue from 'vue';

import LogoutIcon from 'vue-tabler-icons/icons/LogoutIcon';


export default Vue.component('nav-header', {
  components: { LogoutIcon },
  props: ['title'],
  sockets: {
    data({ user }) {
      this.username = user.username;
    },
  },
  data() {
    return {
      username: '',
    };
  },
});
</script>