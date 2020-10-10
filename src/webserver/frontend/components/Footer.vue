<style scoped>
@import '../css/theme';

.footer {
  text-transform: uppercase;
  display: flex;
  height: $br-footer-height - 20px;
  font-size: $br-footer-font;
  color: $br-fg-footer;
  background-color: $br-bg-footer;
  font-weight: bold;
  padding: 10px;
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