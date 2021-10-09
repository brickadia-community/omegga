<style lang="scss">
@import '../css/style';

.grid-container {
  position: relative;
  max-height: calc(100vh - 24px * 2 - 8px * 2 - 113px);
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

.vue-grid-item.vue-grid-placeholder {
  background-color: $br-button-normal !important;
}

.drag-contents {
  position: relative;
  display: flex;
  align-items: stretch;
  flex: 1;
}

@media screen and (max-width: 600px) {
  .vue-grid-layout {
    margin: -8px;
    width: calc(100% + 16px);
  }

  .grid-container {
    margin-top: 0;
    max-height: none;
    overflow: hidden;
  }
}
</style>

<template>
  <page :loading="loading">
    <nav-header title="Dashboard">
      <div class="widgets-container">
        <br-button
          normal
          boxy
          data-tooltip="Add more widgets to the dashboard"
          @click="showWidgets = !showWidgets"
        >
          <AppsIcon />
          Widgets
        </br-button>
        <div
          class="widgets-list"
          :style="{ display: showWidgets ? 'block' : 'none' }"
        >
          <div v-for="(widget, k) in widgetList" :key="k" class="widget-item">
            <div class="name" :data-tooltip="widget.tooltip">
              <component :is="widget.icon" />
              {{ k }}
            </div>
            <br-button
              main
              icon
              v-if="!hasWidget[k]"
              :data-tooltip="'Add ' + k + ' widget'"
              @click="addWidget(k)"
            >
              <PlusIcon />
            </br-button>
            <br-button
              warn
              icon
              v-else
              :data-tooltip="'Remove ' + k + ' widget'"
              @click="removeWidget(k)"
            >
              <MinusIcon />
            </br-button>
          </div>
        </div>
      </div>
    </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
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
          <grid-item
            v-for="item in layout"
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
              <span style="flex: 1">{{ item.i }}</span>
              <br-button
                icon
                error
                class="no-drag"
                data-tooltip="Close widget"
                @click="removeWidget(item.i)"
              >
                <XIcon />
              </br-button>
            </br-header>
            <div class="drag-contents">
              <component v-if="item.component" :is="item.component"></component>
            </div>
            <ChevronDownRightIcon class="resize-handle" />
          </grid-item>
        </grid-layout>
      </div>
    </page-content>
  </page>
</template>

<script>
import { GridLayout, GridItem } from 'vue-grid-layout';

import AppsIcon from 'vue-tabler-icons/icons/AppsIcon';
import PlusIcon from 'vue-tabler-icons/icons/PlusIcon';
import MinusIcon from 'vue-tabler-icons/icons/MinusIcon';
import MessageDotsIcon from 'vue-tabler-icons/icons/MessageDotsIcon';
import ListIcon from 'vue-tabler-icons/icons/ListIcon';
import XIcon from 'vue-tabler-icons/icons/XIcon';
import ChevronDownRightIcon from 'vue-tabler-icons/icons/ChevronDownRightIcon';

export default {
  created() {},
  methods: {
    layoutUpdated(layout) {
      localStorage.omeggaDashLayout = JSON.stringify(layout);
    },
    removeWidget(id) {
      this.layout = this.layout.filter(l => l.i !== id);
    },
    addWidget(id) {
      this.layout.push({
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        i: id,
        component: this.widgetList[id].component,
      });
    },
  },
  sockets: {},
  computed: {
    hasWidget() {
      return Object.fromEntries(this.layout.map(l => [l.i, true]));
    },
  },
  data() {
    // default layout
    let layout = [
      { x: 0, y: 0, w: 2, h: 2, i: 'chat', component: 'br-chat-widget' },
      { x: 2, y: 0, w: 2, h: 2, i: 'status', component: 'br-status-widget' },
    ];

    if (localStorage.omeggaDashLayout) {
      layout = JSON.parse(localStorage.omeggaDashLayout);
    }

    /* this.$route.name */
    return {
      loading: false,
      showWidgets: false,
      widgetList: {
        chat: {
          component: 'br-chat-widget',
          icon: 'MessageDotsIcon',
          tooltip: 'Chat with online players',
        },
        status: {
          component: 'br-status-widget',
          icon: 'ListIcon',
          tooltip: 'View current online players and server status',
        },
      },
      layout,
    };
  },
  components: {
    AppsIcon,
    PlusIcon,
    MinusIcon,
    MessageDotsIcon,
    ListIcon,
    XIcon,
    ChevronDownRightIcon,
    GridLayout,
    GridItem,
  },
};
</script>
