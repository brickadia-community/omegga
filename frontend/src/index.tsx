import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Router } from 'wouter';
import { useBrowserLocation } from 'wouter/use-browser-location';
import { NotFound } from './views/NotFound';
import { ServerView } from './views/server';
import { HistoryView } from './views/history';
import { Page } from '@components';

const App = () => {
  return (
    <Page>
      <Router hook={useBrowserLocation}>
        <Route path="/" component={() => <>Welcome to Omegga!</>} />
        <Route path="/history" component={HistoryView} />
        <Route path="/history/:time" component={HistoryView} />
        <Route path="/plugins" component={() => <>TODO: plugins</>} />
        <Route path="/players" component={() => <>TODO: players</>} nest>
          <Route path="/:id" component={() => <>TODO: player details</>} />
        </Route>
        <Route path="/users" component={() => <>TODO: users</>} />
        <Route path="/server" component={ServerView} />
        <Route path="*" component={NotFound} />
      </Router>
    </Page>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
