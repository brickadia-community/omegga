<style scoped lang="scss">
@import '../css/style';


.br-list-input {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  user-select: none;
  width: 100%;

  &.disabled {
    pointer-events: none;
    opacity: 50%;
    cursor: default;
  }

  .br-list-item {
    @include row;
    margin-bottom: 8px;
    width: 100%;

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
    <div v-for="(v, i) in value || []" class="br-list-item" :key="i">
      <br-input v-if="['string', 'password', 'number'].includes(type)"
        :value="value[i]"
        @input="val => updateItem(i, val)"
        :placeholder="placeholder ? placeholder.toString() : ''"
        :type="type"
      />
      <br-dropdown v-if="type === 'enum'"
        :value="value[i]"
        :options="options"
        @input="val => updateItem(i, val)"
      />
      <br-role-dropdown v-if="type === 'role'"
        :value="value[i]"
        @input="val => updateItem(i, val)"
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
      const clone = this.value.slice();
      clone[index] = val;
      this.$emit('input', clone);
    },
    addItem() {
      const clone = this.value.slice();
      clone.push({string: '', number: 0, password: '', enum: this.options && this.options[0]}[this.type]);
      this.$emit('input', clone);
    },
    removeItem(index) {
      const clone = this.value.slice();
      clone.splice(index, 1);
      this.$emit('input', clone);
    }
  },
  props: {
    placeholder: String,
    disabled: Boolean,
    type: String,
    value: Array,
    options: Array,
  },
});

</script>
