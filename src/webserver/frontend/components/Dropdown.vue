<style scoped lang="scss">
@import '../css/style';

.dropdown {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  font-weight: bold;
  cursor: pointer;
  user-select: none;
  position: relative;
  width: 100%;

  &:not(:last-child) {
    margin-bottom: 0;
  }

  &.disabled {
    pointer-events: none;
    opacity: 50%;
    cursor: default;
  }

  .options {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);

    .green {
      background-color: $br-main-normal;

      &:hover {
        background: $br-main-hover;
        outline: none;
      }

      &:active {
        background: $br-main-pressed;
        outline: none;
      }
    }
  }

  .option, .selected {
    font-family: 'Glacial Indifference';
    background: $br-element-normal;
    color: $br-inverted-fg;
    height: $br-element-height;
    padding: 2px 12px;
    padding-right: 0;
    box-sizing: border-box;
    font-weight: bold;
    font-size: $br-element-font;

    &:hover {
      background: $br-element-overlay;
      outline: none;
    }

    &:active {
      background: $br-element-pressed;
      outline: none;
    }
  }

  .selected {
    display: flex;
    border: none;
    align-items: center;

    .value {
      flex: 1;
    }
  }

  .icon {
    margin-right: 8px;
  }
}

</style>

<template>
  <div :class="['dropdown', {
    disabled,
  }]" ref="self">
    <div class="options" v-if="open">
      <div v-for="o in options"
        :class="['option', {green: value === o}]"
        :key="o"
        @click="open = false; $emit('input', o);"
      >
        {{o}}
      </div>
    </div>
    <div class="selected" @click="open = !open">
      <div class="value">{{value}}</div>
      <CaretDownIcon/>
    </div>
  </div>
</template>
<script>

import Vue from 'vue';
import CaretDownIcon from 'vue-tabler-icons/icons/CaretDownIcon';

export default Vue.component('br-dropdown', {
  components: {
    CaretDownIcon,
  },
  beforeDestroy() {
    // remove click detection
    document.removeEventListener('click', this.handleClick);
  },
  created() {
    // detect clicks outside of this element
    document.addEventListener('click', this.handleClick);
  },
  methods: {
    handleClick(e) {
      // basically anytime there's a click, this component should be closed
      if (open && !this.$refs.self.contains(e.target)) {
        this.open = false;
      }
    }
  },
  props: {
    disabled: Boolean,
    options: Array,
    value: [String, Number],
  },
  data() {
    return {
      listener: undefined,
      open: false,
    };
  },
});

</script>
