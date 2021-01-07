<style scoped lang="scss">
@import '../css/style';


.br-list-input {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  user-select: none;

  &.disabled {
    pointer-events: none;
    opacity: 50%;
    cursor: default;
  }

  .br-list-item {
    @include row;
    margin-bottom: 8px;

    .button {
      margin-left: 8px;
    }
  }

  & > .button {
    margin-bottom: 8px;
  }
}

</style>

<template>
  <div :class="['br-list-input', {
    disabled,
  }]">
    <div v-for="(v, i) in value || []" class="br-list-item">
      <br-input
        :key="i"
        :value="value[i]"
        @input="val => updateItem(i, val)"
        :placeholder="placeholder ? placeholder.toString() : ''"
        :type="type"
      />
      <br-button icon warn
        data-tooltip="Remove this item from the list"
        @click="removeItem(i)">
        <MinusIcon/>
      </br-button>
    </div>
    <br-button icon main
      data-tooltip="Add an item to the list"
      @click="addItem()">
      <PlusIcon/>
    </br-button>
  </div>
</template>
<script>

import Vue from 'vue';

import PlusIcon from 'vue-tabler-icons/icons/PlusIcon';
import MinusIcon from 'vue-tabler-icons/icons/MinusIcon';

export default Vue.component('br-list-input', {
  components: {
    PlusIcon, MinusIcon,
  },
  methods: {
    updateItem(index, val) {
      this.value[index] = val;
      this.$emit('input', this.value);
    },
    addItem() {
      this.value.push({string: '', number: 0, password: ''}[this.type])
    },
    removeItem(index) {
      this.value.splice(index, 1);
      this.$emit('input', this.value);
    }
  },
  props: {
    placeholder: String,
    disabled: Boolean,
    type: String,
    value: Array,
  },
});

</script>
