<style scoped lang="scss">
@import '../css/style';

.button {
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  height: $br-element-height;
  font-size: $br-element-font;
  border-radius: 16px;
  box-sizing: border-box;
  color: $br-button-fg;
  font-weight: bold;
  padding: 0 16px;
  cursor: pointer;
  user-select: none;

  &.boxy {
    border-radius: 0;
    padding: 0 8px;
  }

  &:not(:last-child) {
    margin-right: 8px;
  }

  &:not(.icon) .icon {
    margin-right: 8px;
  }

  &.icon {
    border-radius: 0;
    padding: 0;
    width: $br-element-height;
    min-width: $br-element-height;
  }

  &.disabled {
    opacity: 50%;
    cursor: default;
    pointer-events: none;
  }

  .button-content {
    display: flex;
    text-align: center;
    align-items: center;
    justify-content: center;
  }

  &:not(.disabled):active .button-content {
    padding-top: 4px;
  }

  &.warn {
    @include br-button($br-warn-normal, $br-warn-hover, $br-warn-pressed);
  }

  &.main {
    @include br-button($br-main-normal, $br-main-hover, $br-main-pressed);
  }

  &.info {
    @include br-button($br-info-normal, $br-info-hover, $br-info-pressed);
  }

  &.error {
    @include br-button($br-error-normal, $br-error-hover, $br-error-pressed);
  }

  &.normal {
    @include br-button($br-element-normal, $br-element-hover, $br-element-pressed);
    color: $br-boring-button-fg;
  }
}


</style>

<template>
  <div :class="['button', {
    warn: (typeof warn !== 'undefined'),
    main: (typeof main !== 'undefined'),
    error: (typeof error !== 'undefined') ,
    info: (typeof info !== 'undefined'),
    normal: (typeof normal !== 'undefined'),
    disabled: (typeof disabled !== 'undefined') && disabled,
    boxy: (typeof boxy !== 'undefined'),
    icon: (typeof icon !== 'undefined'),
  }]" @click="$emit('click', $event)">
    <div class="button-content">
      <slot/>
    </div>
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-button', {
  props: ['warn', 'main', 'icon', 'error', 'info', 'normal', 'disabled', 'boxy'],
});

</script>