<style scoped>
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

</style>

<template>
  <div class="background">
    <img class="bg-img" src="/public/img/auth_bg.webp">
    <slot />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-background', {
});

</script>