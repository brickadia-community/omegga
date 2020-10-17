import VueRouter from 'vue-router';

import Home from './views/Home.vue';
import Plugins from './views/Plugins.vue';
import PluginsInspector from './views/PluginsInspector.vue';
import History from './views/History.vue';
import NotFound from './views/NotFound.vue';

const router = new VueRouter({
  mode: 'history',
  base: '/',
  routes: [{
    name: 'history',
    path: '/history',
    component: History,
    children: [{
      name: 'history',
      path: '/history/:time',
      component: History,
    }],
  }, {
    name: 'plugins',
    path: '/plugins',
    component: Plugins,
    children: [{
      name: 'plugins',
      path: '/plugins/:id',
      component: PluginsInspector
    }],
  }, {
    name: 'home',
    path: '/',
    component: Home,
  }, {
    name: 'notfound',
    path: '*',
    component: NotFound
  }],
});

export default router;