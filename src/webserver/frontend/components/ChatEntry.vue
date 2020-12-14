<style lang="scss" scoped>
@import '../css/style';

.log-entry {
  text-decoration: none;

  .log-row {
    display: flex;
    align-items: center;

    .user, .time-link {
      text-decoration: none;
    }

    .time-link {
      display: flex;
      align-items: center;

      .icon {
        opacity: 0;
        color: white;
      }
    }

    .message {
      flex: 1;
    }
  }

  &:hover .log-row {
    background: rgba(255, 255, 255, 0.2);

    .icon { opacity: 1; }
  }

  &.focused .log-row {
    background: $br-main-normal;
  }

}
</style>

<template>
  <div
    :class="['log-entry', {focused: $route.params.time == log.created}]"
  >
    <div class="log-row">
      <router-link :to="'/history/' + ($route.params.time == log.created ? '' : log.created)" class="time-link">
        <LinkIcon />
        <chat-time :time="log.created"/>
      </router-link>
      <div v-if="log.action === 'msg'" class="chat-message message" v-once>
        {{log.user.web ? '[' : ''}}<span v-if="log.user.web"
          class="user"
          :style="{color: '#'+log.user.color}"
        >{{log.user.name}}</span><router-link v-else :to="'/players/' + log.user.id"
          class="user"
          :style="{color: '#'+log.user.color}"
        >{{log.user.name}}</router-link>{{log.user.web ? ']' : ''}}: <span v-html="xss(log.message)" v-linkified />
      </div>
      <div v-if="log.action === 'leave'" class="message join-message" v-once>
        <router-link class="user" :to="'/players/' + log.user.id">
          {{log.user.name}}
        </router-link> left the game.
      </div>
      <div v-if="log.action === 'join'" class="message join-message" v-once>
        <router-link class="user" :to="'/players/' + log.user.id">
          {{log.user.name}}
        </router-link> joined the game{{log.user.isFirst ? ' for the first time' : ''}}.
      </div>
      <div v-if="log.action === 'server'" class="message server-message">
        {{log.message}}
      </div>
    </div>
  </div>
</template>

<script>

import Vue from 'vue';

import LinkIcon from 'vue-tabler-icons/icons/LinkIcon';

export default Vue.component('br-chat-entry', {
  components: { LinkIcon },
  props: {
    log: {type: Object},
  },
  data () {
    return {
    };
  }
});
</script>