<style lang="scss">
@import '../css/theme';

$btn-height: 60px;
$icon-height: $btn-height - 16px;

.menu-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  text-transform: uppercase;
  height: $btn-height;
  font-size: 30px;
  color: $br-button-fg;
  background-color: $br-bg-secondary;
  font-weight: bold;
  padding: 0;
  cursor: pointer;
  user-select: none;
  margin: 8px 0;
  text-decoration: none;
  width: 350px;
}

.menu-button-content {
  display: flex;
  text-align: center;
  align-items: center;
  justify-content: center;
}

.menu-button .ti, .menu-button .icon {
  display: flex;
  width: $icon-height;
  height: $icon-height;
  margin-left: 8px;
  align-items: center;
  justify-content: center;
  margin-right: 24px;
}

.menu-button:hover { background-color: $br-element-hover; }
.menu-button:active {background-color: $br-bg-footer; }
.menu-button.active {background-color: $br-button-normal; }

.menu-button.disabled {
  opacity: 50%;
  cursor: default;
  pointer-events: none;
}

.menu-button:not(.disabled):active .menu-button-content {
  padding-top: 4px;
}

</style>

<template>
  <router-link :to="'/'+route" :class="['menu-button', {
    disabled,
    active: (name || route) === this.$route.name,
  }]" @click="$emit('click', $event)">
    <div class="menu-button-content">
      <slot/>
    </div>
  </router-link>
</template>
<script>

import Vue from 'vue';

export default Vue.component('br-menu-button', {
  props: ['disabled', 'route', 'name'],
});

</script>