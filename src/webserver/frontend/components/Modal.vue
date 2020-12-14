<style scoped lang="scss">
@import '../css/style.scss';

.modal {
  @include absolute-center;
  background-color: $br-bg-primary;
  width: 500px;
  opacity: 0;

  &.visible {
    opacity: 1;
    animation: fadeIn 0.4s ease 1;
  }

  .modal-content {
    position: relative;
  }

}


</style>

<template>
  <div :class="['modal', {visible}]">
    <div class="modal-content">
      <slot/>
    </div>
  </div>
</template>

<script>

import Vue from 'vue';

export default Vue.component('br-modal', {
  props: {
    visible: Boolean,
  },
});

</script>