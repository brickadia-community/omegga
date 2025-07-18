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
import { WorldList } from './views/worlds/WorldList';

const App = () => (
  <Page>
    <Router hook={useBrowserLocation}>
      <Switch>
        <Route path="/" component={HomeView} />
        <Route path="/history/:time?" component={HistoryView} />
        <Route path="/players/:id?" component={PlayerList} />
        <Route path="/plugins/:id?" component={PluginList} />
        <Route path="/server" component={ServerView} />
        <Route path="/users/:id?" component={UserList} />
        <Route path="/worlds/*?" component={WorldList} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  </Page>
);

createRoot(document.getElementById('root')!).render(<App />);
