<style scoped>
@import '../css/theme';

.input {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  font-weight: bold;
  cursor: pointer;
  user-select: none;
  margin: 10px;
}

.input:not(:last-child) {
  margin-bottom: 0;
}

.input input {
  height: $br-element-height;
  font-family: 'Glacial Indifference';
  padding: 2px 12px;
  font-weight: bold;
  font-size: $br-element-font;
  background: $br-element-normal;
  color: $br-inverted-fg;
  border: none;
}

.input input::placeholder {
  color: $br-element-bg;
}

.input input:focus {
  background: $br-element-overlay;
  outline: none;
}

.input .ti {
  margin-right: 8px;
}

.input.icon {
  border-radius: 0;
  padding: 0;
  width: $br-element-height;
}

.input.disabled {
  pointer-events: none;
  opacity: 50%;
  cursor: default;
}

</style>

<template>
  <div :class="['input', {
    disabled: typeof disabled !== 'undefined' && disabled,
  }]">
    <input
      spellcheck="false"
      :value="value"
      @input="$emit('input', $event.target.value)"
      :placeholder="placeholder.toUpperCase()"
      :type="type"
    />
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-input', {
  props: ['placeholder', 'disabled', 'type', 'value'],
});

</script>