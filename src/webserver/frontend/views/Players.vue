<style lang="scss" scoped>
@import '../css/style';

.players-container {
  display: flex;
  align-items: stretch;
}

.player-table-container, .player-inspector-container {
  @include column-container;
}

.player-table-container {
  margin-right: 16px;

  .input {
    max-width: 300px;
    margin-right: 8px;
    flex: 1;
    width: 100%;
  }
}

.players-list {
  @include column-container;
  flex: 1;
  background-color: $br-element-popout-bg;

  .br-table {
    width: 100%;
    flex: 1;

    thead th {
      &:hover {
        background-color: $br-element-hover;
      }

      &:active {
        background-color: $br-element-pressed;
      }

      span {
        @include row;
        align-items: center;
        position: relative;
        cursor: pointer;
        user-select: none;

        .icon {
          color: $br-boring-button-fg;
          padding: 0;
          position: absolute;
          left: 16px;
          transform: translate(-100%);
        }
      }
    }

    tbody tr {
      cursor: pointer;
      user-select: none;

      &:hover td, &.router-link-active td {
        background-color: $br-element-hover;
      }

      &:active td {
        background-color: $br-element-pressed;
      }
    }
  }

  .pagination-footer {
    @include row;
    align-items: center;

    .current-page {
      @include center;
      font-size: 16px;
      flex: 1;
      font-weight: bold;
      color: white;
    }
  }
}


.player-inspector {
  @include column;
  background-color: $br-element-popout-bg;
  flex: 1;
  position: relative;
}

@media screen and (max-width: 600px) {

}

</style>

<template>
  <page>
    <nav-header title="Players">
    </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
      <div class="generic-container players-container">
        <div class="player-table-container">
          <br-navbar>
            <br-input placeholder="Search Players..." v-model="search" @input="doSearch()"/>
            <span style="flex: 1"/>
            <br-button icon normal
              data-tooltip="Refresh player list"
              @click="getPlayers"
            >
              <RotateIcon />
            </br-button>
          </br-navbar>
          <div class="players-list">
            <br-scroll>
              <table class="br-table">
                <thead>
                  <tr>
                    <th
                      style="text-align: left; width: 100%"
                      @click="setSort('name')"
                    >
                      <span>
                        Name
                        <SortAscendingIcon v-if="sort === 'name' && direction === 1" />
                        <SortDescendingIcon v-if="sort === 'name' && direction === -1" />
                      </span>
                    </th>
                    <th @click="setSort('heartbeats')">
                      <span>
                        Time
                        <SortAscendingIcon v-if="sort === 'heartbeats' && direction === 1" />
                        <SortDescendingIcon v-if="sort === 'heartbeats' && direction === -1" />
                      </span>
                    </th>
                    <th @click="setSort('sessions')">
                      <span>
                        Visits
                        <SortAscendingIcon v-if="sort === 'sessions' && direction === 1" />
                        <SortDescendingIcon v-if="sort === 'sessions' && direction === -1" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="player in players" @click="$router.push({path: `/players/${player.id}`})">
                    <td>{{player.name}}</td>
                    <td style="text-align: right;">{{time(player.heartbeats)}}</td>
                    <td style="text-align: right;">{{player.sessions}}</td>
                  </tr>
                </tbody>
              </table>
              <!-- <div is="router-link" v-for="plugin in plugins"
                v-if="matches(plugin)"
                :to="'/plugins/' + plugin.path"
                :key="plugin.path"
                :data-tooltip="plugin.documentation && plugin.documentation.description"
                class="plugin-item"
              >
                <component :is="plugin.icon" :class="[plugin.status]" :data-tooltip="plugin.tooltip" />
                {{plugin.name}}
              </div> -->
            </br-scroll>
            <br-footer class="pagination-footer">
              <br-button
                icon
                normal
                :disabled="page === 0"
                @click="page=0;getPlayers()"
              >
                <ArrowBarToLeftIcon/>
              </br-button>
              <br-button
                icon
                normal
                :disabled="page === 0"
                @click="page--;getPlayers()"
              >
                <ArrowLeftIcon/>
              </br-button>
              <div class="current-page">
                Page {{page + 1}} of {{pages}}, Showing {{players.length}} of {{total}}
              </div>
              <br-button
                icon
                normal
                :disabled="page >= pages - 1"
                @click="page++;getPlayers()"
              >
                <ArrowRightIcon/>
              </br-button>
              <br-button
                icon
                normal
                :disabled="page === pages - 1"
                @click="page=pages-1;getPlayers()"
              >
                <ArrowBarToRightIcon/>
              </br-button>
            </br-footer>
            <br-loader :active="loading" size="huge">Loading Plugins</br-loader>
          </div>
        </div>
        <div class="player-inspector-container">
          <br-navbar>
            {{selectedPlayer}}
          </br-navbar>
          <div class="player-inspector">
            <!-- <router-view :key="$route.params.id" /> -->
          </div>
        </div>
      </div>
    </page-content>
  </page>
</template>

<script>
import RotateIcon from 'vue-tabler-icons/icons/RotateIcon';
import ArrowBarToLeftIcon from 'vue-tabler-icons/icons/ArrowBarToLeftIcon';
import ArrowBarToRightIcon from 'vue-tabler-icons/icons/ArrowBarToRightIcon';
import ArrowLeftIcon from 'vue-tabler-icons/icons/ArrowLeftIcon';
import ArrowRightIcon from 'vue-tabler-icons/icons/ArrowRightIcon';
import SortAscendingIcon from 'vue-tabler-icons/icons/SortAscendingIcon';
import SortDescendingIcon from 'vue-tabler-icons/icons/SortDescendingIcon';

import debounce from 'lodash/debounce';

export default {
  components: { RotateIcon, ArrowBarToLeftIcon, ArrowBarToRightIcon, ArrowLeftIcon, ArrowRightIcon, SortAscendingIcon, SortDescendingIcon },
  created() {
    this.getPlayers();
  },
  methods: {
    // get a list of players
    async getPlayers() {
      this.loading = true;
      const { players, total, pages } = await this.$$request('players.list', {
        page: this.page,
        search: this.search,
        sort: this.sort,
        direction: this.direction,
      });
      this.pages = pages;
      this.total = total;
      this.players = players;
      this.loading = false;
    },

    // debounced search
    doSearch: debounce(function(){
      this.page = 0;
      this.getPlayers();
    }, 500),

    time(mins) {
      if (mins < 60) return mins + ' mins';
      mins /= 60;
      if (mins < 24) return Math.round(mins) + ' hours';
      mins /= 24;
      return Math.round(mins) + ' days';
    },

    // update table sort direction
    setSort(sort) {
      // flip direction if it's the same column
      if (this.sort === sort) {
        this.direction *= -1;
      } else {
        // otherwise, use the new column and ascending order
        this.sort = sort;
        this.direction = 1;
      }
      this.getPlayers();
    }
  },
  sockets: {
  },
  computed: {
    selectedPlayer() {
      const player = this.players.find(p => p.id === this.$route.params.id);
      if (player) return player.name;
      return 'SELECT A PLAYER';
    }
  },
  data() {
    return {
      search: '',
      sort: 'name',
      direction: 1,
      pages: 0,
      total: 0,
      page: 0,
      loading: true,
      players: [],
    };
  },
};

</script>
