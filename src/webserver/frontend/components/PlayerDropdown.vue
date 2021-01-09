<style scoped lang="scss">
@import '../css/style';


.br-player-list {
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

  .br-player-item {
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

  .player-search {
    position: relative;

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
    width: 100%;
    text-decoration: none;

    &:not(.search):hover {
      background: $br-element-overlay;
      outline: none;
    }

    &:not(.search):active {
      background: $br-element-pressed;
      outline: none;
    }
  }
}

</style>

<template>
  <div :class="['br-player-list', {
    disabled,
  }]">
    <div v-for="(v, i) in value || []" class="br-player-item" :key="i">
      <router-link :to="'/players/' + v.id" class="selected" data-tooltip="Click to navigate to player page">
        {{v.name}}
      </router-link>
      <br-button icon warn
        data-tooltip="Remove this player from the list"
        @click="removeItem(i)">
        <MinusIcon/>
      </br-button>
    </div>
    <div class="player-search" ref="self">
      <br-input
        placeholder="Search Players..."
        v-model="search"
        @input="() => doSearch()"
      />
      <div class="options" v-if="open">
        <div class="option search" style="position: relative;" v-if="loadingSearch">
          <br-loader active size="small"></br-loader>
        </div>
        <div v-for="p in players"
          class="option"
          :key="p.id"
          @click="open = false; addItem(p)"
        >
          {{p.name}}
        </div>
      </div>
    </div>
  </div>
</template>
<script>

import Vue from 'vue';
import debounce from 'lodash/debounce';

import PlusIcon from 'vue-tabler-icons/icons/PlusIcon';
import MinusIcon from 'vue-tabler-icons/icons/MinusIcon';

export default Vue.component('br-player-list', {
  components: {
    PlusIcon, MinusIcon,
  },
  beforeDestroy() {
    // remove click detection
    document.removeEventListener('click', this.handleClick);
  },
  async created() {
    // detect clicks outside of this element
    document.addEventListener('click', this.handleClick);
  },
  methods: {
    handleClick(e) {
      // basically anytime there's a click, this component should be closed
      if (open && !this.$refs.self.contains(e.target)) {
        this.open = false;
        this.players = [];
      }
    },
    updateItem(index, val) {
      const clone = this.value.slice();
      clone[index] = val;
      this.$emit('input', clone);
    },
    addItem(o) {
      this.open = false;
      this.players = [];
      this.search = '';

      const clone = this.value.slice();
      clone.push({id: o.id, name: o.name});
      this.$emit('input', clone);
    },
    removeItem(index) {
      const clone = this.value.slice();
      clone.splice(index, 1);
      this.$emit('input', clone);
    },
    doSearch: debounce(function(){
      if (this.search.length !== 0) {
        this.page = 0;
        this.open = true;
        this.getPlayers();
      } else {
        this.open = false;
        this.players = [];
      }
    }, 500),
    async getPlayers() {
      this.loadingSearch = true;
      const { players } = await this.$$request('players.list', {
        page: 0,
        search: this.search,
        sort: 'lastSeen',
        direction: -1,
        filter: '',
      });
      this.players = players;
      this.loadingSearch = false;
    },
  },
  props: {
    placeholder: String,
    disabled: Boolean,
    type: String,
    value: Array,
  },
  data() {
    return {
      search: '',
      options: ['foo', 'bar', 'baz'],
      players: [],
      loadingSearch: false,
      open: false,
    };
  },
});

</script>
