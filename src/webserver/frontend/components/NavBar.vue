<style scoped>
@import '../css/theme';

.navbar {
  display: flex;
  height: 32px;
  font-size: $br-footer-font;
  color: $br-fg-footer;
  background-color: $br-bg-footer;
  font-weight: bold;
  padding: 10px;
}

</style>

<template>
  <div class="navbar">
    <slot />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-navbar', {
});

</script>