<style lang="scss" scoped>
@import '../css/theme';

$btn-height: 80px;

.button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  text-transform: uppercase;
  height: $btn-height;
  font-size: 40px;
  color: $br-button-fg;
  background-color: $br-bg-secondary;
  font-weight: bold;
  padding: 0;
  cursor: pointer;
  user-select: none;
  margin: 8px 0;
}

.button .ti {
  width: $btn-height - 16px;
  height: $btn-height - 16px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24px;
}

.button-content {
  display: flex;
  text-align: center;
  align-items: center;
  justify-content: center;
}


.button:hover { background-color: $br-element-normal; }
.button:active {background-color: $br-bg-footer; }

.button.disabled {
  opacity: 50%;
  cursor: default;
  pointer-events: none;
}

.button:not(.disabled):active .button-content {
  padding-top: 4px;
}

</style>

<template>
  <div :class="['button', {
    disabled: disabled,
  }]" @click="$emit('click', $event)">
    <div class="button-content">
      <slot/>
    </div>
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-menu-button', {
  props: ['disabled'],
});

</script>