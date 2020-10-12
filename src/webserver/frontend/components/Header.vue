<style scoped>
@import '../css/theme';

.header {
  text-transform: uppercase;
  display: flex;
  font-size: $br-header-font;
  color: $br-fg-header;
  background-color: $br-bg-header;
  font-weight: bold;
  height: $br-header-height;
  align-items: center;
  padding-left: 20px;
  padding-right: 10px;
}

</style>

<template>
  <div class="header">
    <slot />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-header', {
});

</script>