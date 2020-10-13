<style lang="scss">
@import '../css/style';

div {
  font-family: 'Glacial Indifference';
}

html {
  width: 100%;
  height: 100%;
  display: table;
}

body {
  width: 100%;
  display: table-cell;
  position: relative;
  overflow: hidden;
}

.content-parent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 100%;
}

.content {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 24px;
}

.main-menu-buttons {
  width: 400px;
  min-width: 300px;
}

.main-content {
  display: flex;
  flex: 1;
  position: relative;
}

.grid-container {
  position: relative;
  max-height: calc(100vh - 50px - 24px * 2 - 8px);
  margin-top: 8px;
  width: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
  z-index: 10;
}

.vue-grid-layout {
  position: absolute;
  left: 0;
  margin-top: -8px;
  top: 0;
  width: 100%;
  height: 100%;
}

.vue-grid-item:not(.vue-grid-placeholder) {
  background-color: $br-element-popout-bg;
}
.vue-grid-item .resizing {
  opacity: 0.9;
}

.vue-grid-item {
  display: flex;
  flex-direction: column;
}

.vue-draggable-dragging .drag-handle {
  background-color: $br-element-footer-bg;
}

.vue-resizable-handle {
  opacity: 0;
}

.resize-handle {
  color: $br-boring-button-fg;
  font-size: 24px;
  position: absolute;
  right: -4px;
  bottom: -4px;
}

.disable-userselect {
}

.vue-grid-item.vue-grid-placeholder {
  background-color: $br-button-normal !important;
}

.drag-contents {
  position: relative;
  display: flex;
  align-items: stretch;
  flex: 1;
}

.widgets-container {
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.widgets-list {
  background-color: $br-element-footer-bg;
  margin-right: 8px;
  min-width: 200px;
}

.widget-item {
  background-color: $br-bg-primary;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 50px;
  padding: 0 10px;
}

.widget-item .name {
  display: flex;
  align-items: center;
}

.widget-item .name .ti {
  margin-right: 10px;
}

.widget-item:nth-child(even) {
  background-color: $br-bg-primary-alt;
}

@media screen and (max-width: 600px) {
  .main-content {
    flex-direction: column;
    margin-bottom: 24px;
  }

  .main-menu-buttons {
    width: 100%;
    min-width: 100%;
  }

  .vue-grid-layout {
    margin: -8px;
    width: calc(100% + 16px);
  }

  body {
    overflow-y: auto;
  }

  .grid-container {
    margin-top: 0;
    max-height: none;
    overflow: hidden;
  }
}

</style>

<template>
  <div>
    <br-background />
    <div class="content-parent">
      <div class="content" v-if="!loading">
        <br-navbar>
          <span style="flex: 1; margin-left: 8px">
            Welcome, {{user.username}}
          </span>
          <div class="widgets-container">
            <br-button normal boxy
              data-tooltip="Add more widgets to the dashboard"
              @click="showWidgets = !showWidgets"
            >
              <i class="ti ti-apps"/>
              Widgets
            </br-button>
            <div class="widgets-list" :style="{display: showWidgets ? 'block' : 'none'}">
              <div v-for="widget, k in widgetList" :key="k" class="widget-item">
                <div class="name" :data-tooltip="widget.tooltip.js">
                  <i :class="['ti', widget.icon]"/>
                  {{k}}
                </div>
                <br-button normal icon v-if="!hasWidget[k]"
                  :data-tooltip="'Add '+k+' widget'"
                  @click="addWidget(k)"
                >
                  <i class="ti ti-plus"/>
                </br-button>
                <br-button warn icon v-else
                  :data-tooltip="'Remove '+k+' widget'"
                  @click="removeWidget(k)"
                >
                  <i class="ti ti-minus"/>
                </br-button>
              </div>
            </div>
          </div>
          <br-button icon error
            v-if="showLogout"
            data-tooltip="Logout of Web UI"
            @click="logout()"
          >
            <i class="ti ti-logout"/>
          </br-button>
        </br-navbar>
        <div class="main-content">
          <!-- home {{$route.name}} -->
          <div class="main-menu-buttons">
            <br-menu-button
              :disabled="true"
              data-tooltip="Browse chat history"
            >
              <i class="ti ti-messages" style="background: #008bd6;"/>
              History
            </br-menu-button>
            <br-menu-button
              :disabled="true"
              data-tooltip="Manage, reload, and configure plugins"
            >
              <i class="ti ti-plug" style="background: #00b35f;"/>
              Plugins
            </br-menu-button>
            <br-menu-button
              :disabled="true"
              data-tooltip="Browse player info and play time"
            >
              <i class="ti ti-users" style="background: #b3006b;"/>
              Players
            </br-menu-button>
            <br-menu-button
              :disabled="true"
              data-tooltip="View statistics and metrics for the server"
            >
              <i class="ti ti-chart-line" style="background: #00b0bd;"/>
              Metrics
            </br-menu-button>
            <br-menu-button
              :disabled="true"
              data-tooltip="Browse, create, load, and clear saves"
            >
              <i class="ti ti-device-floppy" style="background: #565882;"/>
              Saves
            </br-menu-button>
            <br-menu-button
              :disabled="true"
              data-tooltip="Server management settings and roles"
            >
              <i class="ti ti-adjustments-alt" style="background: #c4bb02;"/>
              Settings
            </br-menu-button>
          </div>
          <div class="grid-container">
            <grid-layout
              :layout="layout"
              :colNum="5"
              :row-height="100"
              :is-draggable="true"
              :is-resizable="true"
              :vertical-compact="false"
              :margin="[8, 8]"
              :responsive="true"
              :use-css-transforms="true"
              @layout-updated="layoutUpdated"
            >
              <grid-item v-for="item in layout"
               :x="item.x"
               :y="item.y"
               :w="item.w"
               :h="item.h"
               :i="item.i"
               :key="item.i"
               :minW="2"
               :maxW="10"
               :minH="2"
               :maxH="10"
               drag-allow-from=".drag-handle"
               drag-ignore-from=".no-drag"
              >
                <br-header class="drag-handle">
                  <span style="flex: 1">{{item.i}}</span>
                  <br-button icon error class="no-drag"
                    data-tooltip="Close widget"
                    @click="removeWidget(item.i)"
                  >
                    <i class="ti ti-x" />
                  </br-button>
                </br-header>
                <div class="drag-contents">
                  <!--
                    create component for tab
                  -->
                  <component v-if="item.component" :is="item.component"></component>
                  <!-- <div class="no-drag">
                    <br-button main>foo</br-button>
                  </div> -->
                </div>
                <i class="ti ti-chevron-down-right resize-handle" />
              </grid-item>
            </grid-layout>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>

import { GridLayout, GridItem } from 'vue-grid-layout';

export default {
  created() {

  },
  methods: {
    logout() {
      fetch('/api/v1/logout').then(() => location.reload());
    },
    layoutUpdated(layout) {
      localStorage.omeggaDashLayout = JSON.stringify(layout);
    },
    removeWidget(id) {
      this.layout = this.layout.filter(l => l.i !== id);
    },
    addWidget(id) {
      this.layout.push({
        x: 0, y: 0,
        w: 2, h: 2,
        i: id,
        component: this.widgetList[id].component,
      });
    },
  },
  sockets: {
    data(data) {
      console.log('data is', data);
      this.user = data.user;
      this.roles = data.roles;
      this.showLogout = data.canLogOut;
      this.loading = false;
    }
  },
  computed: {
    hasWidget() {
      return Object.fromEntries(this.layout.map(l => [l.i, true]));
    },
  },
  data() {
    // default layout
    let layout = [
      {x: 0, y: 0, w: 2, h: 2, i: 'chat', component: 'br-chat-widget'},
      {x: 2, y: 0, w: 2, h: 2, i: 'status', component: 'br-status-widget'},
    ];

    if (localStorage.omeggaDashLayout) {
      layout = JSON.parse(localStorage.omeggaDashLayout);
    }

    /* this.$route.name */
    return {
      loading: true,
      showLogout: false,
      showWidgets: false,
      widgetList: {
        chat: {
          component: 'br-chat-widget',
          icon: 'ti-message-dots',
          tooltip: 'Read and chat with online players',
        },
        status: {
          component: 'br-status-widget',
          icon: 'ti-list',
          tooltip: 'View current online players and server status',
        },
      },
      roles: [],
      user: {},
      layout,
    };
  },
  components: {
    GridLayout,
    GridItem,
  },
};

</script>
