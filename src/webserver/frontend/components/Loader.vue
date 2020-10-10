<style scoped>
@import '../css/theme';

.loader {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: none;
  align-items: stretch;
  flex-direction: column;
}

.loader.active {
  display: flex;
}

.loader-container {
  flex: 1;
}

.loader-container.blur {
  backdrop-filter: blur(5px);
}

.loader.inline {
  position: relative;
  display: inline-block;
  left: auto;
  right: auto;
  width: auto;
  height: auto;
}

.loader-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: white;
}

.inline .loader-container {
  display: block;
  color: inherit;
}

.loader-icon {
  color: white;
  animation: rotating 2s infinite linear;
}

@keyframes rotating {
  0% { transform: rotate(0); }
  50% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
}

.loader-icon.small { font-size: 24px; }
.loader-icon.normal { font-size: 30px; }
.loader-icon.huge { font-size: 60px; }
.loader-icon.massive { font-size: 120px; }

</style>

<template>
  <div :class="['loader', {
    active: (typeof active !== 'undefined' && active),
    inline: (typeof inline !== 'undefined'),
  }]" @click="$emit('click', $event)">
    <div :class="['loader-container', {blur: (typeof blur !== 'undefined')}]">
      <i :class="['loader-icon ti ti-loader', size || 'normal']" />
      <div><slot /></div>
    </div>
  </div>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-loader', {
  props: ['active', 'size', 'blur', 'inline'],
});

</script>