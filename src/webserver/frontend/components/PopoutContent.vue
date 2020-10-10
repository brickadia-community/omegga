<style scoped>
@import '../css/theme';

.popout-content {
  background-color: $br-bg-primary;
  color: $br-boring-button-fg;
  font-weight: bold;
  font-size: $br-element-font;
  padding: 20px;
}

.popout-content > p { margin: 20px 0; }
.popout-content > p:first-child { margin-top: 0; }
.popout-content > p:last-child { margin-bottom: 0; }

</style>

<template>
  <div class="popout-content">
    <slot />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-popout-content', {
});

</script>