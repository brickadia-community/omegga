import { IconArrowRight, IconLockOpen } from '@tabler/icons-react';
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Background } from '../components/background';
import { Button } from '../components/button';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { Input } from '../components/input';
import { Loader } from '../components/loader';
import { Modal } from '../components/modal';
import { PopoutContent } from '../components/popout';

const Auth = () => {
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    fetch('/api/v1/first')
      .then(response => response.json())
      .then(data => {
        setFirstLoad(data);
        setLoading(false);
      });
  }, []);

  const tryAuth = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.status === 200) {
        location.reload();
      } else {
        console.error(data.message);
      }
    } catch (error) {
      console.error('Authentication failed:', error);
    }
    setLoading(false);
  }, []);

  const authBlank = username.length === 0 && password.length === 0;
  const authOk = username.match(/^\w{0,32}$/) && !authBlank;

  const turkeyStyle = useMemo(
    () => ({ top: `${Math.random() * 50 + 25}%` }),
    []
  );

  return (
    <div>
      <Background>
        <div className="turkey" style={turkeyStyle}>
          <img src="/public/img/turkey.webp" />
        </div>
      </Background>
      <Modal visible={!loading}>
        <Header>Brickadia Server Login</Header>
        <PopoutContent>
          <p>Welcome to the Omegga Web UI.</p>
          {firstLoad && (
            <p>
              Enter credentials for an Admin user. You can also skip this step
              if you don't want to use a password.
            </p>
          )}
        </PopoutContent>
        <div className="popout-inputs">
          <Input
            placeholder="username"
            type="text"
            value={username}
            onChange={setUsername}
          />
          <Input
            placeholder="password"
            type="password"
            value={password}
            onChange={setPassword}
          />
          {firstLoad && (
            <Input
              placeholder="confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
            />
          )}
        </div>
        <Footer>
          {firstLoad && (
            <Button
              main
              disabled={!authOk || confirm !== password}
              onClick={() => tryAuth(username, password)}
            >
              <IconArrowRight /> Create
            </Button>
          )}
          {!firstLoad && (
            <Button
              main
              disabled={!authOk}
              onClick={() => tryAuth(username, password)}
            >
              <IconArrowRight /> Login
            </Button>
          )}
          <div style={{ flex: 1 }} />
          {firstLoad && (
            <Button
              warn
              disabled={!authBlank || confirm !== password}
              onClick={() => tryAuth('', '')}
            >
              <IconLockOpen /> Skip
            </Button>
          )}
        </Footer>
        <Loader active={loading} blur size="huge">
          <b>AUTHORIZING</b>
        </Loader>
      </Modal>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth />
  </StrictMode>
);
