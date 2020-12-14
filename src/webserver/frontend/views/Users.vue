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

        padding-left: 20px;

        &.icon-cell {
          padding-right: 0;
        }

        .label, .icon {
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

      &:hover td, &.active td {
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
    <nav-header title="Users">
      <span style="flex: 1"/>
      <br-button
        normal
        @click="toggleCredentials()"
        data-tooltip="Enable user sign-in"
      >
        <CirclePlusIcon v-if="omeggaData.userless"/>
        <LockIcon v-else />
        {{omeggaData.userless ? 'Enable Users' : 'Change Password'}}
      </br-button>
      <br-button
        normal
        v-if="!omeggaData.userless && user.isOwner"
        @click="toggleAddUser()"
        data-tooltip="Add a new user"
      >
        <UserPlusIcon />
        Add User
      </br-button>
    </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
      <div class="generic-container players-container">
        <div class="player-table-container">
          <br-navbar>
            <br-input placeholder="Search Users..." v-model="search" @input="doSearch()"/>
            <span style="flex: 1"/>
            <br-button icon normal
              data-tooltip="Refresh user list"
              @click="getUsers"
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
                      @click="setSort('username')"
                    >
                      <span>
                        Username
                        <SortAscendingIcon v-if="sort === 'username' && direction === 1" />
                        <SortDescendingIcon v-if="sort === 'username' && direction === -1" />
                      </span>
                    </th>
                    <th @click="setSort('lastOnline')" data-tooltip="When the user was last active">
                      <span>
                        Active
                        <SortAscendingIcon v-if="sort === 'lastOnline' && direction === 1" />
                        <SortDescendingIcon v-if="sort === 'lastOnline' && direction === -1" />
                      </span>
                    </th>
                    <th @click="setSort('created')" data-tooltip="When the user joined">
                      <span>
                        Joined
                        <SortAscendingIcon v-if="sort === 'created' && direction === 1" />
                        <SortDescendingIcon v-if="sort === 'created' && direction === -1" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="u in users" @click="clickUser(u)" :class="{active: u.username === $route.params.id}">
                    <td>
                      {{u.username || 'Admin'}}
                      <span v-if="(u.username || 'Admin') === user.username" style="font-size: 12px;">
                        (You)
                      </span>
                    </td>
                    <td style="text-align: right;" :data-tooltip="u.lastOnline ? new Date(u.lastOnline) : 'Never'">
                      {{u.lastOnline ? duration(u.seenAgo) : 'Never'}}
                    </td>
                    <td style="text-align: right;" :data-tooltip="new Date(u.created)">
                      {{duration(u.createdAgo)}}
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
                @click="page=0;getUsers()"
              >
                <ArrowBarToLeftIcon/>
              </br-button>
              <br-button
                icon
                normal
                :disabled="page === 0"
                @click="page--;getUsers()"
              >
                <ArrowLeftIcon/>
              </br-button>
              <div class="current-page">
                Page {{page + 1}} of {{pages}}, Showing {{users.length}} of {{total}}
              </div>
              <br-button
                icon
                normal
                :disabled="page >= pages - 1"
                @click="page++;getUsers()"
              >
                <ArrowRightIcon/>
              </br-button>
              <br-button
                icon
                normal
                :disabled="page === pages - 1"
                @click="page=pages-1;getUsers()"
              >
                <ArrowBarToRightIcon/>
              </br-button>
            </br-footer>
            <br-loader :active="loading" size="huge">Loading Users</br-loader>
          </div>
        </div>
        <div class="player-inspector-container">
          <br-navbar>Not Implemented</br-navbar>
          <div class="player-inspector">
            <router-view :key="$route.params.id" />
          </div>
        </div>
        <br-dimmer :visible="showCredentials || showCreateUser">
          <br-loader :active="modalLoading" size="huge">Submitting</br-loader>
          <br-modal :visible="!modalLoading">
            <br-header>
              {{showCreateUser ? 'Create New User' : 'Update Credentials'}}
            </br-header>
            <br-popout-content>
              <p v-if="omeggaData.userless">This will require you to enter a password when you sign in.</p>
              <p v-if="omeggaData.userless">This action cannot be undone.</p>
              <p v-if="!omeggaData.userless && showCredentials">
                Updating credentials for user &quot;{{username}}&quot;
              </p>
              <p v-if="showCreateUser">
                Creating a new user. It&apos;s recommended to create a temporary password.
              </p>
              <p v-if="error" style="color: red">
                Error: {{error}}
              </p>
            </br-popout-content>
            <div class="popout-inputs">
              <br-input
                v-if="omeggaData.userless || showCreateUser"
                placeholder="username"
                type="text"
                v-model="username"
              />
              <br-input
                placeholder="password"
                type="password"
                v-model="password"
              />
              <br-input
                placeholder="confirm password"
                type="password"
                v-model="confirm"
              />
            </div>
            <br-footer>
              <br-button main
                :disabled="!ok || confirm !== password"
                @click="submit(username, password)"
              >
                <UserPlusIcon v-if="showCreateUser" />
                <LockIcon v-else />
                {{showCreateUser ? 'Add' : 'Update'}}
              </br-button>
              <div style="flex: 1" />
              <br-button warn
                @click="hideModals"
              >
                <XIcon/>Cancel
              </br-button>
            </br-footer>
          </br-modal>
        </br-dimmer>
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
import UserPlusIcon from 'vue-tabler-icons/icons/UserPlusIcon';
import CirclePlusIcon from 'vue-tabler-icons/icons/CirclePlusIcon';
import XIcon from 'vue-tabler-icons/icons/XIcon';
import LockIcon from 'vue-tabler-icons/icons/LockIcon';

import debounce from 'lodash/debounce';

export default {
  components: { RotateIcon, ArrowBarToLeftIcon, ArrowBarToRightIcon, ArrowLeftIcon, ArrowRightIcon, SortAscendingIcon, SortDescendingIcon, UserPlusIcon, CirclePlusIcon, XIcon, LockIcon, },
  created() {
    this.getUsers();
    setTimeout(() => {
      if (this.userLookup[this.$route.params.id]) {
        this.update++;
      }
    }, 500);
  },
  methods: {
    async submit(username, password) {
      this.error = '';
      if (password !== this.confirm)
        return;

      this.modalLoading = true;
      let error;
      try {
        if (this.showCredentials) {
          if (this.omeggaData.userless) {
            error = await this.$$request('users.create', username, password);
          } else {
            error = await this.$$request('users.passwd', this.user.username, password);
          }
        } else if (this.showCreateUser) {
          error = await this.$$request('users.create', username, password);
        }

        this.modalLoading = false;
        if (!error) {
          // if you are changing your credentials for the first time, it will force you to log back in
          if (this.showCredentials && this.omeggaData.userless)
            this.logout();
          else
            this.hideModals();
          return;
        }
      } catch (e) {
        console.error('error submitting form', e);
      }

      this.error = error;
    },

    toggleCredentials() {
      this.showCredentials = !this.showCredentials;
      this.showCreateUser = false;
      if (!this.omeggaData.userless)
        this.username = this.user.username;
      this.error = '';
    },

    toggleAddUser() {
      this.showCreateUser = !this.showCreateUser;
      this.showCredentials = false;
      this.username = '';
      this.error = '';
    },

    hideModals() {
      this.username = '';
      this.password = '';
      this.confirm = '';
      this.showCredentials = false;
      this.showCreateUser = false;
      this.error = '';
    },

    // get a list of users
    async getUsers() {
      this.loading = true;
      const { users, total, pages } = await this.$$request('users.list', {
        page: this.page,
        search: this.search,
        sort: this.sort,
        direction: this.direction,
      });
      this.pages = pages;
      this.total = total;
      this.users = users;
      this.loading = false;
    },

    // redirect to a user page
    clickUser(user) {
      if (this.$route.params.id !== user.username)
        this.$router.push({path: `/users/${user.username}`});
    },

    // debounced search
    doSearch: debounce(function(){
      this.page = 0;
      this.getUsers();
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
      this.getUsers();
    }
  },
  sockets: {
  },
  computed: {
    ok() {
      const nameOk = this.username.length !== 0 || !(this.showCredentials && !this.userless)
      return this.username.match(/^\w{0,32}$/) && nameOk && this.password.length !== 0
    },
    blank() {
      return this.username.length === 0 && this.password.length === 0
    },
    selectedUser() {
      this.update;
      if (this.userLookup[this.$route.params.id]) {
        return this.userLookup[this.$route.params.id];
      }
      const user = this.users.find(p => p.username === this.$route.params.id);
      if (user) return user.username;
      return 'SELECT A USER';
    }
  },
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
      users: [],
      showCredentials: false,
      showCreateUser: false,
      modalLoading: false,

      error: '',
      username: '',
      password: '',
      confirm: '',
    };
  },
};

</script>
