<style lang="scss" scoped>
@import '../css/style';

.players-container {
  display: flex;
  align-items: stretch;
}

.player-table-container,
.player-inspector-container {
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

        padding-left: 20px;

        &.icon-cell {
          padding-right: 0;
        }

        .label,
        .icon {
          padding: 0;
        }

        .icon:not(.label) {
          color: $br-boring-button-fg;
          position: absolute;
          left: 16px;
          transform: translate(-100%);
        }
      }
    }

    tbody tr {
      cursor: pointer;
      user-select: none;

      .ban {
        color: $br-error-normal;
        vertical-align: center;
      }

      &:hover td,
      &.active td {
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

.widgets-container {
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  .widgets-list {
    background-color: $br-element-footer-bg;
    margin-right: 8px;
    min-width: 200px;

    .widget-item {
      background-color: $br-bg-primary;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 50px;
      padding: 0 10px;

      &:nth-child(even) {
        background-color: $br-bg-primary-alt;
      }

      .name {
        text-transform: uppercase;
        display: flex;
        align-items: center;

        .icon {
          margin-right: 10px;
        }
      }
    }
  }
}

.player-inspector {
  @include column;
  background-color: $br-element-popout-bg;
  flex: 1;
  position: relative;
}
</style>

<template>
  <page>
    <nav-header title="Players">
      <div class="widgets-container">
        <br-button
          normal
          boxy
          data-tooltip="Player list filters"
          @click="showFilters = !showFilters"
        >
          <FilterIcon />
          Filters
        </br-button>
        <div
          class="widgets-list"
          :style="{ display: showFilters ? 'block' : 'none' }"
        >
          <div class="widget-item" data-tooltip="Filter by banned players">
            <div class="name">
              <BanIcon />
              Banned
            </div>
            <br-toggle @input="value => doSearch()" v-model="filterBanned" />
          </div>
        </div>
      </div>
    </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
      <div class="generic-container players-container">
        <div class="player-table-container">
          <br-navbar>
            <br-input
              placeholder="Search Players..."
              v-model="search"
              @input="doSearch()"
            />
            <span style="flex: 1" />
            <br-button
              icon
              normal
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
                        <SortAscendingIcon
                          v-if="sort === 'name' && direction === 1"
                        />
                        <SortDescendingIcon
                          v-if="sort === 'name' && direction === -1"
                        />
                      </span>
                    </th>
                    <th
                      @click="setSort('heartbeats')"
                      data-tooltip="Number of heartbeats the player has been part of (minutely)"
                    >
                      <span>
                        Played
                        <SortAscendingIcon
                          v-if="sort === 'heartbeats' && direction === 1"
                        />
                        <SortDescendingIcon
                          v-if="sort === 'heartbeats' && direction === -1"
                        />
                      </span>
                    </th>
                    <th
                      @click="setSort('lastSeen')"
                      data-tooltip="When the player was last seen"
                    >
                      <span>
                        Seen
                        <SortAscendingIcon
                          v-if="sort === 'lastSeen' && direction === 1"
                        />
                        <SortDescendingIcon
                          v-if="sort === 'lastSeen' && direction === -1"
                        />
                      </span>
                    </th>
                    <th
                      @click="setSort('created')"
                      data-tooltip="When the player joined"
                    >
                      <span>
                        Joined
                        <SortAscendingIcon
                          v-if="sort === 'created' && direction === 1"
                        />
                        <SortDescendingIcon
                          v-if="sort === 'created' && direction === -1"
                        />
                      </span>
                    </th>
                    <th
                      @click="setSort('sessions')"
                      data-tooltip="Number of Visits"
                    >
                      <span class="icon-cell">
                        <MapPinIcon class="label" size="30" />
                        <SortAscendingIcon
                          v-if="sort === 'sessions' && direction === 1"
                        />
                        <SortDescendingIcon
                          v-if="sort === 'sessions' && direction === -1"
                        />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="player in players"
                    @click="clickPlayer(player)"
                    :class="{ active: player.id === $route.params.id }"
                    :key="player.id"
                  >
                    <td :class="{ ban: !!player.ban }">
                      {{ player.name }}
                      <BanIcon v-if="player.ban" size="18" />
                    </td>
                    <td style="text-align: right">
                      {{ heartbeatAgo(player.heartbeats) }}
                    </td>
                    <td
                      style="text-align: right"
                      :data-tooltip="new Date(player.lastSeen)"
                    >
                      {{ duration(player.seenAgo) }}
                    </td>
                    <td
                      style="text-align: right"
                      :data-tooltip="new Date(player.created)"
                    >
                      {{ duration(player.createdAgo) }}
                    </td>
                    <td style="text-align: right">
                      {{ player.sessions }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </br-scroll>
            <br-footer class="pagination-footer">
              <br-button
                icon
                normal
                :disabled="page === 0"
                @click="
                  page = 0;
                  getPlayers();
                "
              >
                <ArrowBarToLeftIcon />
              </br-button>
              <br-button
                icon
                normal
                :disabled="page === 0"
                @click="
                  page--;
                  getPlayers();
                "
              >
                <ArrowLeftIcon />
              </br-button>
              <div class="current-page">
                Page {{ page + 1 }} of {{ pages }}, Showing
                {{ players.length }} of {{ total }}
              </div>
              <br-button
                icon
                normal
                :disabled="page >= pages - 1"
                @click="
                  page++;
                  getPlayers();
                "
              >
                <ArrowRightIcon />
              </br-button>
              <br-button
                icon
                normal
                :disabled="page === pages - 1"
                @click="
                  page = pages - 1;
                  getPlayers();
                "
              >
                <ArrowBarToRightIcon />
              </br-button>
            </br-footer>
            <br-loader :active="loading" size="huge">Loading Players</br-loader>
          </div>
        </div>
        <div class="player-inspector-container" v-if="!$route.params.id">
          <br-navbar>
            SELECT A PLAYER
          </br-navbar>
          <div class="player-inspector" />
        </div>
        <router-view :key="$route.params.id" v-else />
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
import MapPinIcon from 'vue-tabler-icons/icons/MapPinIcon';
import BanIcon from 'vue-tabler-icons/icons/BanIcon';
import FilterIcon from 'vue-tabler-icons/icons/FilterIcon';

import debounce from 'lodash/debounce';

export default {
  components: {
    RotateIcon,
    ArrowBarToLeftIcon,
    ArrowBarToRightIcon,
    ArrowLeftIcon,
    ArrowRightIcon,
    SortAscendingIcon,
    SortDescendingIcon,
    MapPinIcon,
    BanIcon,
    FilterIcon,
  },
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
        filter: this.filterBanned ? 'banned' : '',
      });
      this.pages = pages;
      this.total = total;
      this.players = players;
      this.loading = false;
    },

    // redirect to a player page
    clickPlayer(player) {
      if (this.$route.params.id !== player.id)
        this.$router.push({ path: `/players/${player.id}` });
    },

    // debounced search
    doSearch: debounce(function() {
      this.page = 0;
      this.getPlayers();
    }, 500),

    // update table sort direction
    setSort(sort) {
      // flip direction if it's the same column
      if (this.sort === sort) {
        this.direction *= -1;
      } else {
        // otherwise, use the new column
        this.sort = sort;
        // sort only name ascending on first click, all metrics are descending
        this.direction = sort === 'name' ? 1 : -1;
      }
      this.getPlayers();
    },
  },
  sockets: {},
  computed: {},
  data() {
    return {
      search: '',
      sort: 'lastSeen',
      direction: -1,
      pages: 0,
      total: 0,
      page: 0,
      update: 0,
      loading: true,
      filterBanned: false,
      showFilters: false,
      players: [],
    };
  },
};
</script>
