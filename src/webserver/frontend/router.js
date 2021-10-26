import VueRouter from 'vue-router';

import Home from './views/Home.vue';
import Plugins from './views/Plugins.vue';
import PluginsInspector from './views/PluginsInspector.vue';
import Players from './views/Players.vue';
import PlayersInspector from './views/PlayersInspector.vue';
import Users from './views/Users.vue';
import History from './views/History.vue';
import Server from './views/Server.vue';
import NotFound from './views/NotFound.vue';

const router = new VueRouter({
  mode: 'history',
  base: '/',
  routes: [
    {
      name: 'history',
      path: '/history',
      component: History,
      children: [
        {
          name: 'history',
          path: '/history/:time',
          component: History,
        },
      ],
    },
    {
      name: 'plugins',
      path: '/plugins',
      component: Plugins,
      children: [
        {
          name: 'plugins',
          path: '/plugins/:id',
          component: PluginsInspector,
        },
      ],
    },
    {
      name: 'players',
      path: '/players',
      component: Players,
      children: [
        {
          name: 'players',
          path: '/players/:id',
          component: PlayersInspector,
        },
      ],
    },
    {
      name: 'users',
      path: '/users',
      component: Users,
      children: [
        /*{
      name: 'users',
      path: '/users/:id',
      component: UsersInspector
    }*/
      ],
    },
    {
      name: 'home',
      path: '/',
      component: Home,
    },
    {
      name: 'server',
      path: '/server',
      component: Server,
    },
    {
      name: 'notfound',
      path: '*',
      component: NotFound,
    },
  ],
});

export default router;
