<style>
@import '../css/theme';

.chat-widget {
  display: flex;
  flex: 1;
  flex-direction: column;
  position: relative;
  align-items: stretch;
  max-width: 100%;
}

.chat-widget .messages {
  flex: 1;
  position: relative;
}

.messages-parent {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
}

.messages-child {
  display: flex;
  flex-direction: column;
  margin: 8px;
}

.chat-widget .input, .chat-widget input {
  height: 32px;
  max-height: 32px;
  box-sizing: border-box;
  margin: 0 !important;
}

.chat-widget .input {
  flex: 1;
  width: calc(100% - 24px - 20px);
}

.chat-widget .footer {
}

.messages .log-entry {
  font-size: 24px;
  text-shadow:  -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
  word-break: break-all;
}

.messages .log-entry .user {
  font-weight: bold;
}

.log-entry .join-message {
  color: #3477e3;
}

.log-entry .chat-message {
  color: #ffffff;
}

</style>

<template>
  <div class="chat-widget">
    <div class="messages">
      <div class="messages-parent">
        <div class="messages-child">
          <div v-for="log in chats" :key="log._id" class="log-entry">
            <div v-if="log.action === 'msg'" class="chat-message">
              {{log.user.web ? '[' : ''}}<span class="user" :style="{color: '#'+log.user.color}"
              >{{log.user.name}}</span>{{log.user.web ? ']' : ''}}: {{log.message}}
            </div>
            <div v-if="log.action === 'leave'" class="join-message">
              <span class="user">{{log.user.name}}</span> left the game.
            </div>
            <div v-if="log.action === 'join'" class="join-message">
              <span class="user">{{log.user.name}}</span> joined the game.
            </div>
          </div>
        </div>
      </div>
    </div>
    <form @submit="sendMessage">
      <br-footer>
        <br-input type="text" placeholder="Message" v-model="message" />
        <br-button normal icon style="margin-left: 10px" @click="sendMessage">
          <i class="ti ti-send"/>
        </br-button>
      </br-footer>
    </form>
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-chat-widget', {
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
        const container = this.$el.querySelector('.messages-parent');
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
