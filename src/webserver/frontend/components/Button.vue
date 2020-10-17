<style scoped>
@import '../css/theme';

.button {
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  height: $br-element-height;
  font-size: $br-element-font;
  border-radius: $br-element-height/2;
  box-sizing: border-box;
  color: $br-button-fg;
  font-weight: bold;
  padding: 0 16px;
  cursor: pointer;
  user-select: none;
}

.button.boxy {
  border-radius: 0;
  padding: 0 8px;
}

.button:not(:last-child) {
  margin-right: 8px;
}

.button:not(.icon) .icon {
  margin-right: 8px;
}

.button.icon {
  border-radius: 0;
  padding: 0;
  width: $br-element-height;
}

.button.disabled {
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

.button:not(.disabled):active .button-content {
  padding-top: 4px;
}

.warn { background-color: $br-warn-normal; }
.warn:hover { background-color: $br-warn-hover; }
.warn:active, .warn.disabled {background-color: $br-warn-pressed; }

.main { background-color: $br-main-normal; }
.main:hover { background-color: $br-main-hover; }
.main:active, .main.disabled {background-color: $br-main-pressed; }

.info { background-color: $br-info-normal; }
.info:hover { background-color: $br-info-hover; }
.info:active, .info.disabled {background-color: $br-info-pressed; }

.error { background-color: $br-error-normal; }
.error:hover { background-color: $br-error-hover; }
.error:active, .error.disabled {background-color: $br-error-pressed; }

.normal {
  color: $br-boring-button-fg;
  background-color: $br-element-normal;
}
.normal:hover { background-color: $br-element-hover; }
.normal:active, .normal.disabled {background-color: $br-element-pressed; }

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