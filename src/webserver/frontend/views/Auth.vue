<style lang="scss">
@import '../css/style';

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

.modal {
  @include absolute-center;
  background-color: $br-bg-primary;
  width: 500px;
  opacity: 0;

  &.visible {
    opacity: 1;
    animation: fadeIn 0.4s ease 1;
  }

  .modal-content {
    position: relative;
  }

}

@keyframes fadeIn {
  0% {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 40px));
  }
  100% {
    opacity: 1;
    top: 50%;
    transform: translate(-50%, -50%);
  }
}

.turkey {
  filter: blur(10px);
  position: absolute;
  left: -20vw;
  top: 30%;
  animation: turkeyBob 5s infinite ease-in-out, turkeyMove 20s infinite alternate linear;
}

.turkey img {
  animation: turkeyRotate 7s infinite ease-in-out;
}

@keyframes turkeyBob {
  0% { transform: translateY(0); }
  33% { transform: translateY(-20px); }
  67% { transform: translateY(20px); }
  100% { transform: translateY(0); }
}
@keyframes turkeyRotate {
  0% { transform: rotate(0); }
  33% { transform: rotate(-20deg); }
  67% { transform: rotate(20deg); }
  100% { transform: rotate(0); }
}
@keyframes turkeyMove {
  0% { left: -30vw; }
  100% { left: calc(100% + 30vw); }
}

</style>

<template>
  <div>
    <br-background>
      <div class="turkey" :style="{top: turkey + '%'}">
        <img src="/public/img/turkey.webp"/>
      </div>
    </br-background>
    <div :class="['modal', {visible}]">
      <div class="modal-content">
        <br-header>Brickadia Server Login</br-header>
        <br-popout-content>
          <p>Welcome to the Omegga Web UI.</p>
          <p v-if="create">
            Enter credentials for an Admin user. You can also skip this step if you don't want to use a password.
          </p>
        </br-popout-content>
        <div class="popout-inputs">
          <br-input placeholder="username" type="text" v-model="username" />
          <br-input placeholder="password" type="password" v-model="password" />
          <br-input v-if="create" placeholder="confirm password" type="password" v-model="confirm" />
        </div>
        <br-footer>
          <br-button main v-if="create"
            :disabled="!ok || confirm !== password"
            @click="auth(username, password)"
          >
            <ArrowRightIcon />Create
          </br-button>
          <br-button main v-else
            :disabled="!ok"
            @click="auth(username, password)"
          >
            <ArrowRightIcon />Login
          </br-button>
          <div style="flex: 1" />
          <br-button warn v-if="create"
            :disabled="!blank || confirm !== password"
            @click="auth('', '')"
          >
            <LockOpenIcon/>Skip
          </br-button>
        </br-footer>
        <br-loader :active="loading" blur size="huge"><b>AUTHORIZING</b></br-loader>
      </div>
    </div>
  </div>
</template>

<script>

import ArrowRightIcon from 'vue-tabler-icons/icons/ArrowRightIcon';
import LockOpenIcon from 'vue-tabler-icons/icons/LockOpenIcon';


export default {
  components: { ArrowRightIcon, LockOpenIcon },
  computed: {
    // check if entered credentials are okay
    ok() {
      return this.username.match(/^\w{0,32}$/) && this.username.length !== 0 && this.password.length !== 0
    },
    // check if entered credentials are blank
    blank() {
      return this.username.length === 0 && this.password.length === 0
    },
  },
  methods: {
    auth(username, password) {
      this.loading = true;
      fetch('/api/v1/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({username, password})
      })
        .then(r => Promise.all([r, r.json()]))
        .then(([r, b]) => {
          if (r.status === 200) {
            location.reload();
          } else {
            console.error(b.message)
          }
          this.loading = false
        })
        .catch(e => {
          this.loading = false
          console.error(e)
        })
    }
  },
  created() {
    // check if this is the first user
    fetch('/api/v1/first')
      .then(r => r.json())
      .then(v => {
        this.create = v;
        this.visible = true;
      });
  },
  data() {
    return {
      turkey: Math.random() * 50 + 25,
      create: false,
      visible: false,
      loading: false,
      confirm: '',
      password: '',
      username: '',
    }
  }
};

</script>
