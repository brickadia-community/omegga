import { Page } from '@components';
import { createRoot } from 'react-dom/client';
import { Route, Router, Switch } from 'wouter';
import { useBrowserLocation } from 'wouter/use-browser-location';
import './tooltip';
import { NotFound } from './views/NotFound';
import { HistoryView } from './views/history';
import { HomeView } from './views/home';
import { PlayerList } from './views/players/PlayerList';
import { PluginList } from './views/plugins';
import { ServerView } from './views/server';
import { UserList } from './views/users';

const App = () => (
  <Page>
    <Router hook={useBrowserLocation}>
      <Switch>
        <Route path="/" component={HomeView} />
        <Route path="/history/:time?" component={HistoryView} />
        <Route path="/plugins/:id?" component={PluginList} />
        <Route path="/players/:id?" component={PlayerList} />
        <Route path="/users/:id?" component={UserList} />
        <Route path="/server" component={ServerView} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  </Page>
);

createRoot(document.getElementById('root')!).render(<App />);
