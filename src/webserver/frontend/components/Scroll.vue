<style>

.scroll-container {
  flex: 1;
  position: relative;
}

.scroll-scroller {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll;
}

</style>

<template>
  <div class="scroll-container">
    <div class="scroll-scroller">
      <slot />
    </div>
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-scroll', {
});

</script>