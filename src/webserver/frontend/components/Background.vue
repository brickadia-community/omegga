<style scoped lang="scss">
@import '../css/theme';

.background {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: visible;

  background-image: url('/public/img/auth_bg.webp');
  background-repeat: no-repeat;
  background-attachment: fixed;
  background-size: cover;
  background-position: 50% 50%;
}

.bg-img {
  position: absolute;
  filter: blur(20px);
  left: -40px;
  top: -40px;
  width: calc(100% + 80px);
  height: calc(100% + 80px);
  object-fit: cover;
}

.version {
  position: absolute;
  top: 5px;
  right: 5px;
  font-weight: 200;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}


@media (prefers-color-scheme: dark) {
  .background {
    background-image: url('/public/img/dark_bg.webp');

    .light {
      display: none;
    }
  }
}

@media (prefers-color-scheme: light) {
  .dark {
    display: none;
  }
}

</style>

<template>
  <div class="background">
    <img class="bg-img dark" src="/public/img/dark_bg.webp">
    <img class="bg-img light" src="/public/img/auth_bg.webp">
    <div class="version" v-if="version">Omegga v{{version}}</div>
    <slot />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-background', {
  sockets: {
    data(data) {
      this.version = data.version;
    }
  },
  data() {
    return {
      version: this.omeggaData.version,
    };
  }
});

</script>