<style scoped lang="scss">
@import '../css/style.scss';

.dimmer {
  background-color: $br-bg-primary;
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: none;
  align-items: stretch;

  &.visible {
    display: flex;
  }

  .dimmer-content {
    position: relative;
    flex: 1;
  }
}


</style>

<template>
  <div :class="['dimmer', {visible}]">
    <div class="dimmer-content">
      <slot/>
    </div>
  </div>
</template>

<script>

import Vue from 'vue';

export default Vue.component('br-dimmer', {
  props: {
    visible: Boolean,
  },
});

</script>