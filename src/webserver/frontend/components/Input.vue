<style scoped lang="scss">
@import '../css/style';

.input {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  font-weight: bold;
  cursor: pointer;
  user-select: none;

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

  input {
    height: $br-element-height;
    font-family: 'Glacial Indifference';
    padding: 2px 12px;
    box-sizing: border-box;
    font-weight: bold;
    font-size: $br-element-font;
    background: $br-element-normal;
    color: $br-inverted-fg;
    border: none;

    &::placeholder {
      color: $br-element-bg;
    }

    &:focus {
      background: $br-element-overlay;
      outline: none;
    }
  }

  .icon {
    margin-right: 8px;
  }
}

.header > .input input {
  height: 32px !important;
}
</style>

<template>
  <div
    :data-tooltip="tooltip"
    :class="[
      'input',
      {
        disabled,
      },
    ]"
  >
    <input
      spellcheck="false"
      :value="value"
      @input="
        $emit(
          'input',
          type === 'number' ? Number($event.target.value) : $event.target.value
        )
      "
      :placeholder="placeholder ? placeholder.toString() : ''"
      :type="type"
    />
  </div>
</template>
<script>
import Vue from 'vue';

export default Vue.component('br-input', {
  props: {
    placeholder: String,
    tooltip: String,
    disabled: Boolean,
    type: String,
    value: [String, Number],
  },
});
</script>
