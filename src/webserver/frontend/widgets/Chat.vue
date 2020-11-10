<style lang="scss">
@import '../css/style';

.chat-widget {
  display: flex;
  flex: 1;
  flex-direction: column;
  position: relative;
  align-items: stretch;
  max-width: 100%;

  .messages {
    flex: 1;
    position: relative;

    .messages-child {
      @include column;
      margin: 8px;
    }
  }

  .input {
    flex: 1;
    width: calc(100% - 24px - 20px);
  }
}

</style>

<template>
  <div class="chat-widget">
    <br-scroll class="messages">
      <div class="messages-child">
        <div v-for="log in chats" :key="log._id" class="log-entry">
          <div v-if="log.action === 'msg'" class="chat-message">
            {{log.user.web ? '[' : ''}}<span class="user" :style="{color: '#'+log.user.color}"
            >{{log.user.name}}</span>{{log.user.web ? ']' : ''}}: <span v-html="xss(log.message)" v-linkified />
          </div>
          <div v-if="log.action === 'leave'" class="join-message">
            <span class="user">{{log.user.name}}</span> left the game.
          </div>
          <div v-if="log.action === 'join'" class="join-message">
            <span class="user">{{log.user.name}}</span> joined the game{{log.user.isFirst ? ' for the first time' : ''}}.
          </div>
          <div v-if="log.action === 'server'" class="server-message">
            {{log.message}}
          </div>
        </div>
      </div>
    </br-scroll>
    <form @submit="sendMessage">
      <br-footer>
        <br-input type="text" placeholder="Message" v-model="message" />
        <br-button normal icon style="margin-left: 10px" @click="sendMessage">
          <SendIcon />
        </br-button>
      </br-footer>
    </form>
  </div>
</template>
<script>

import Vue from 'vue';
import SendIcon from 'vue-tabler-icons/icons/SendIcon';


export default Vue.component('br-chat-widget', {
  components: { SendIcon },
  sockets: {
    chat(log) {
      this.chats.push(log);

      // if the log is too long - remove the excess messages (you should probably be in the history view)
      if (this.chats.length > 50)
        this.chats.splice(0, 50 - this.chats.length);

      this.scroll();
    },
    connect() {
      this.getChats();
    },
  },
  beforeDestroy() {
    this.$$emit('unsubscribe', 'chat');
  },
  created() {
    this.getChats();
  },
  methods: {
    getChats() {
      this.$$emit('subscribe', 'chat');
      this.$$request('chat.recent').then(logs => {
        this.chats = logs.reverse();
        this.scroll();
      });
    },
    scroll() {
      // scroll to bottom of message log
      window.requestAnimationFrame(() => {
        const container = this.$el.querySelector('.scroll-scroller');
        container.scrollTop = container.scrollHeight;
      });
    },
    // send message from form
    sendMessage(event) {
      event.preventDefault();

      if (this.message.length > 140 || this.message.length === 0)
        return;

      this.$$notify('chat', this.message);
      this.message = '';
    },
  },
  data() {
    return {
      chats: [],
      message: '',
    }
  },
});

</script>
