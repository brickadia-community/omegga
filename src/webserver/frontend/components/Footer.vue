<style scoped>
@import '../css/theme';

.footer {
  background-color: $br-bg-footer;
  color: $br-fg-footer;
  display: flex;
  font-size: $br-footer-font;
  font-weight: bold;
  height: $br-footer-height - 20px;
  padding: 10px;
  text-transform: uppercase;
}

</style>

<template>
  <div class="footer">
    <slot />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-footer', {
});

</script>