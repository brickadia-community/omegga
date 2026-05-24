import {
  IconArrowRight,
  IconFingerprint,
  IconKey,
  IconLockOpen,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import turkeyImage from '../../assets/img/turkey.webp';
import { Background } from '../components/background';
import { Button } from '../components/button';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { Input } from '../components/input';
import { Loader } from '../components/loader';
import { Modal } from '../components/modal';
import { PopoutContent } from '../components/popout';

type AuthPhase = 'login' | 'mfa-totp';

const canWebAuthn =
  typeof window !== 'undefined' &&
  !!window.PublicKeyCredential &&
  (location.protocol === 'https:' || location.hostname === 'localhost');

const Auth = () => {
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [phase, setPhase] = useState<AuthPhase>('login');
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

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
    setError('');
    try {
      const res = await fetch('/api/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.status === 200) {
        if (data.mfaRequired) {
          setPhase('mfa-totp');
          setLoading(false);
        } else {
          location.reload();
        }
      } else {
        setError(data.message || 'Authentication failed');
        setLoading(false);
      }
    } catch {
      setError('Connection failed');
      setLoading(false);
    }
  }, []);

  const submitTotp = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/mfa/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      if (res.status === 200) {
        location.reload();
      } else {
        const data = await res.json();
        setError(data.message || 'Invalid code');
        setLoading(false);
      }
    } catch {
      setError('Connection failed');
      setLoading(false);
    }
  }, [totpCode]);

  const tryPasskey = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const optRes = await fetch('/api/v1/auth/webauthn/options');
      const options = await optRes.json();

      const { startAuthentication } = await import('@simplewebauthn/browser');
      const credential = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch('/api/v1/auth/webauthn/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      if (verifyRes.status === 200) {
        location.reload();
      } else {
        setError('Passkey verification failed');
        setLoading(false);
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        setLoading(false);
        return;
      }
      setError('Passkey authentication failed');
      setLoading(false);
    }
  }, []);

  const authBlank = username.length === 0 && password.length === 0;
  const authOk = username.match(/^\w{0,32}$/) && !authBlank;

  const turkeyStyle = useMemo(
    () => ({ top: `${Math.random() * 50 + 25}%` }),
    [],
  );

  return (
    <div>
      <Background>
        <div className="turkey" style={turkeyStyle}>
          <img src={turkeyImage} />
        </div>
      </Background>
      <Modal visible={!loading}>
        {phase === 'login' && (
          <>
            <Header attached>Brickadia Server Login</Header>
            <PopoutContent>
              <p>Welcome to the Omegga Web UI.</p>
              {firstLoad && (
                <p>
                  Enter credentials for an Admin user. You can also skip this
                  step if you don't want to use a password.
                </p>
              )}
              {error && (
                <p style={{ color: '#f66', textTransform: 'capitalize' }}>
                  {error}
                </p>
              )}
            </PopoutContent>
            <div className="popout-inputs">
              <Input
                placeholder="Username"
                type="text"
                value={username}
                onChange={setUsername}
              />
              <Input
                placeholder="Password"
                type="password"
                value={password}
                onChange={setPassword}
                onSubmit={
                  !firstLoad && authOk
                    ? () => tryAuth(username, password)
                    : undefined
                }
              />
              {firstLoad && (
                <Input
                  placeholder="Confirm Password"
                  type="password"
                  value={confirm}
                  onChange={setConfirm}
                  onSubmit={
                    authOk && confirm === password
                      ? () => tryAuth(username, password)
                      : undefined
                  }
                />
              )}
            </div>
            <Footer attached>
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
              {!firstLoad && canWebAuthn && (
                <Button normal onClick={tryPasskey}>
                  <IconFingerprint /> Passkey
                </Button>
              )}
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
          </>
        )}
        {phase === 'mfa-totp' && (
          <>
            <Header attached>Two-Factor Authentication</Header>
            <PopoutContent>
              <p>
                {useRecovery
                  ? 'Enter a recovery code to sign in.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>
              {error && <p style={{ color: '#f66' }}>{error}</p>}
            </PopoutContent>
            <div className="popout-inputs">
              <Input
                placeholder={useRecovery ? 'Recovery code' : '000000'}
                type="text"
                value={totpCode}
                onChange={setTotpCode}
                onSubmit={totpCode ? submitTotp : undefined}
              />
            </div>
            <Footer attached>
              <Button main disabled={!totpCode} onClick={submitTotp}>
                <IconShieldCheck /> Verify
              </Button>
              <div style={{ flex: 1 }} />
              <Button
                normal
                onClick={() => {
                  setUseRecovery(!useRecovery);
                  setTotpCode('');
                  setError('');
                }}
              >
                <IconKey />
                {useRecovery ? 'Use app' : 'Use recovery code'}
              </Button>
            </Footer>
          </>
        )}
        <Loader active={loading} blur size="huge">
          <b>AUTHORIZING</b>
        </Loader>
      </Modal>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Auth />);
