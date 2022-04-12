<style scoped lang="scss">
@import '../css/style';

.toggle {
  display: flex;
  font-weight: bold;
  cursor: pointer;
  user-select: none;
  height: $br-element-height;
  width: $br-element-height + 8;
  background: $br-element-normal;

  &:not(:last-child) {
    margin-bottom: 0;
  }

  &.icon {
    border-radius: 0;
    padding: 0;
    width: $br-element-height;
  }

  &.disabled {
    pointer-events: none;
    opacity: 50%;
    cursor: default;
  }

  .toggle-slider {
    @include center;
    width: $br-element-height;
    height: $br-element-height;

    &:focus {
      background: $br-element-overlay;
      outline: none;
    }

    &:not(.on) {
      @include br-button($br-error-normal, $br-error-hover, $br-error-pressed);

      .symbol {
        background-color: transparent;
        width: 10px;
        height: 10px;
        border: 4px solid white;
        border-radius: 50%;
      }
    }

    &.on {
      margin-left: 8px;
      @include br-button($br-main-normal, $br-main-hover, $br-main-pressed);

      .symbol {
        width: 4px;
        height: 16px;
        background-color: white;
        border-radius: 2px;
      }
    }
  }
}
</style>

<template>
  <div
    :data-tooltip="tooltip"
    :class="[
      'toggle',
      { disabled: typeof disabled !== 'undefined' && disabled },
    ]"
    @click="$emit('input', !value)"
  >
    <div :class="['toggle-slider', { on: value }]">
      <div class="symbol" />
    </div>
  </div>
</template>
<script>
import Vue from 'vue';

export default Vue.component('br-toggle', {
  props: {
    tooltip: String,
    disabled: Boolean,
    value: Boolean,
  },
});
</script>
