import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Router } from 'wouter';
import { useBrowserLocation } from 'wouter/use-browser-location';

const App = () => {
  return (
    <Router hook={useBrowserLocation}>
      <Route path="/" component={() => <>Welcome to Omegga!</>} />
      <Route path="/history" component={() => <>TODO: history</>} />
      <Route path="/history/:time" component={() => <>TODO: history</>} />
      <Route path="/plugins" component={() => <>TODO: plugins</>} />
      <Route path="/players" component={() => <>TODO: players</>} nest>
        <Route path="/:id" component={() => <>TODO: player details</>} />
      </Route>
      <Route path="/users" component={() => <>TODO: users</>} />
      <Route path="/server" component={() => <>TODO: server</>} />
      <Route path="*" component={() => <>Not Found!</>} />
    </Router>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
