<style scoped lang="scss">
@import '../css/theme';

.header {
  align-items: center;
  background-color: $br-bg-header;
  color: $br-fg-header;
  display: flex;
  font-size: $br-header-font;
  font-weight: bold;
  height: $br-header-height;
  padding-left: 20px;
  padding-right: 10px;
  text-transform: uppercase;
}
</style>

<template>
  <div class="header">
    <slot />
  </div>
</template>
<script>
import Vue from 'vue';

export default Vue.component('br-header', {});
</script>
