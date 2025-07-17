import { Page } from '@components';
import { createRoot } from 'react-dom/client';
import { Route, Router } from 'wouter';
import { useBrowserLocation } from 'wouter/use-browser-location';
import { HistoryView } from './views/history';
import { HomeView } from './views/home';
import { NotFound } from './views/NotFound';
import { PlayerInspector } from './views/players/PlayerInspector';
import { PluginList } from './views/plugins';
import { ServerView } from './views/server';
import { UserList } from './views/users';

const App = () => (
  <Page>
    <Router hook={useBrowserLocation}>
      <Route path="/" component={HomeView} />
      <Route path="/history" component={HistoryView} />
      <Route path="/history/:time?" component={HistoryView} />
      <Route path="/plugins" component={PluginList} />
      <Route path="/plugins/:id?" component={PluginList} />
      <Route path="/players" component={PlayerInspector} />
      <Route path="/players/:id?" component={PlayerInspector} />
      <Route path="/users" component={UserList} />
      <Route path="/users/:id?" component={UserList} />
      <Route path="/server" component={ServerView} />
      <Route path="*" component={NotFound} />
    </Router>
  </Page>
);

createRoot(document.getElementById('root')!).render(<App />);
