import { Button, Input, Loader } from '@components';
import {
  IconCheck,
  IconCopy,
  IconFingerprint,
  IconKey,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { trpc } from '../../trpc';

const SectionError = ({ error }: { error: string }) =>
  error ? <div className="mfa-error">{error}</div> : null;

export const MfaManager = () => {
  const mfaStatus = trpc.mfa.status.useQuery();
  const totpSetup = trpc.mfa.totp.setup.useMutation();
  const totpEnable = trpc.mfa.totp.enable.useMutation();
  const totpDisable = trpc.mfa.totp.disable.useMutation();
  const passkeyOpts = trpc.mfa.passkey.registerOptions.useMutation();
  const passkeyRegister = trpc.mfa.passkey.register.useMutation();
  const passkeyRemove = trpc.mfa.passkey.remove.useMutation();
  const recoveryGen = trpc.mfa.recoveryCodes.generate.useMutation();

  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCode: string;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const [passkeyPassword, setPasskeyPassword] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [totpError, setTotpError] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [busy, setBusy] = useState(false);

  const canWebAuthn =
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    (location.protocol === 'https:' || location.hostname === 'localhost');

  const startTotpSetup = useCallback(async () => {
    if (!totpPassword) return;
    setTotpError('');
    setBusy(true);
    const data = await totpSetup.mutateAsync({ password: totpPassword });
    setBusy(false);
    if ('error' in data && data.error) {
      setTotpError(data.error);
    } else if ('secret' in data) {
      setSetupData(data as { secret: string; qrCode: string });
      setVerifyCode('');
      setTotpPassword('');
    }
  }, [totpPassword]);

  const confirmTotp = useCallback(async () => {
    if (!setupData) return;
    setTotpError('');
    setBusy(true);
    const err = await totpEnable.mutateAsync({ code: verifyCode });
    setBusy(false);
    if (err) {
      setTotpError(err);
    } else {
      setSetupData(null);
      setVerifyCode('');
      mfaStatus.refetch();
    }
  }, [setupData, verifyCode]);

  const disableTotp = useCallback(async () => {
    if (!totpPassword) return;
    setTotpError('');
    setBusy(true);
    const err = await totpDisable.mutateAsync({ password: totpPassword });
    setBusy(false);
    if (err) {
      setTotpError(err);
    } else {
      setTotpPassword('');
      mfaStatus.refetch();
    }
  }, [totpPassword]);

  const addPasskey = useCallback(async () => {
    setPasskeyError('');
    setBusy(true);
    try {
      const options = await passkeyOpts.mutateAsync();
      const { startRegistration } = await import('@simplewebauthn/browser');
      const credential = await startRegistration({ optionsJSON: options });
      const err = await passkeyRegister.mutateAsync({
        credential,
        name: passkeyName || 'Passkey',
      });
      if (err) setPasskeyError(err);
      else {
        setPasskeyName('');
        mfaStatus.refetch();
      }
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError')
        setPasskeyError(e?.message || 'Registration failed');
    }
    setBusy(false);
  }, [passkeyName]);

  const removePasskey = useCallback(
    async (id: string) => {
      if (!passkeyPassword) {
        setPasskeyError('Enter your password to remove a passkey');
        return;
      }
      setPasskeyError('');
      setBusy(true);
      const err = await passkeyRemove.mutateAsync({
        id,
        password: passkeyPassword,
      });
      if (err) setPasskeyError(err);
      else {
        setPasskeyPassword('');
        mfaStatus.refetch();
      }
      setBusy(false);
    },
    [passkeyPassword],
  );

  const generateRecovery = useCallback(async () => {
    if (!recoveryPassword) return;
    setRecoveryError('');
    setBusy(true);
    const result = await recoveryGen.mutateAsync({
      password: recoveryPassword,
    });
    if ('error' in result && result.error) {
      setRecoveryError(result.error);
    } else if ('codes' in result) {
      setRecoveryCodes(result.codes);
      setRecoveryPassword('');
      mfaStatus.refetch();
    }
    setBusy(false);
  }, [recoveryPassword]);

  const copyRecoveryCodes = useCallback(() => {
    if (recoveryCodes) {
      navigator.clipboard.writeText(recoveryCodes.join('\n'));
    }
  }, [recoveryCodes]);

  if (mfaStatus.isLoading) {
    return (
      <Loader active size="huge">
        Loading MFA
      </Loader>
    );
  }

  const status = mfaStatus.data;

  return (
    <div className="mfa-manager">
      <div className="section-header">Authenticator App</div>
      <div className="stats">
        <SectionError error={totpError} />
        {status?.totpEnabled && !setupData && (
          <>
            <div className="stat">
              <IconShieldCheck size={16} /> TOTP is enabled.
            </div>
            <div className="mfa-actions">
              <Input
                placeholder="Password to disable"
                type="password"
                value={totpPassword}
                onChange={setTotpPassword}
                onSubmit={totpPassword && !busy ? disableTotp : undefined}
              />
              <Button
                warn
                boxy
                disabled={!totpPassword || busy}
                onClick={disableTotp}
              >
                <IconX /> Disable
              </Button>
            </div>
          </>
        )}
        {!status?.totpEnabled && !setupData && (
          <>
            <div className="stat">TOTP is not configured.</div>
            <div className="mfa-actions">
              <Input
                placeholder="Password to set up"
                type="password"
                value={totpPassword}
                onChange={setTotpPassword}
                onSubmit={totpPassword && !busy ? startTotpSetup : undefined}
              />
              <Button
                main
                boxy
                disabled={!totpPassword || busy}
                onClick={startTotpSetup}
              >
                <IconShieldCheck /> Set Up
              </Button>
            </div>
          </>
        )}
        {setupData && (
          <div className="totp-setup">
            <div className="stat">
              Scan this QR code with your authenticator app:
            </div>
            <img
              className="qr-code"
              src={setupData.qrCode}
              alt="TOTP QR Code"
            />
            <div className="stat manual-secret">
              <b>Manual entry:</b> <code>{setupData.secret}</code>
              <Button
                icon
                normal
                data-tooltip="Copy secret"
                onClick={() => navigator.clipboard.writeText(setupData.secret)}
              >
                <IconCopy />
              </Button>
            </div>
            <div className="mfa-actions">
              <Input
                placeholder="6-digit code"
                type="text"
                value={verifyCode}
                onChange={setVerifyCode}
                onSubmit={verifyCode && !busy ? confirmTotp : undefined}
              />
              <Button
                main
                boxy
                disabled={!verifyCode || busy}
                onClick={confirmTotp}
              >
                <IconCheck /> Verify
              </Button>
              <Button
                normal
                boxy
                onClick={() => {
                  setSetupData(null);
                  setTotpError('');
                }}
              >
                <IconX /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {canWebAuthn && (
        <>
          <div className="section-header">Passkeys</div>
          <div className="stats">
            <SectionError error={passkeyError} />
            {status?.passkeys?.length ? (
              <div className="passkey-list">
                {status.passkeys.map(p => (
                  <div key={p.id} className="passkey-item">
                    <span className="passkey-name">
                      <IconFingerprint size={16} /> {p.name}
                    </span>
                    <span className="passkey-meta">
                      Added {new Date(p.created).toLocaleDateString()}
                    </span>
                    <Button
                      icon
                      error
                      disabled={busy}
                      data-tooltip="Remove passkey"
                      onClick={() => removePasskey(p.id)}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stat">No passkeys registered.</div>
            )}
            <div className="mfa-actions">
              <Input
                placeholder="Passkey name"
                type="text"
                value={passkeyName}
                onChange={setPasskeyName}
              />
              <Button main boxy disabled={busy} onClick={addPasskey}>
                <IconPlus /> Add Passkey
              </Button>
            </div>
            {status?.passkeys?.length ? (
              <div className="mfa-actions">
                <Input
                  placeholder="Password to remove"
                  type="password"
                  value={passkeyPassword}
                  onChange={setPasskeyPassword}
                />
              </div>
            ) : (
              <div className="stat note">
                Passkeys may not work with IP addresses. Use a domain name for
                reliable passkey support.
              </div>
            )}
          </div>
        </>
      )}

      <div className="section-header">Recovery Codes</div>
      <div className="stats">
        <SectionError error={recoveryError} />
        {recoveryCodes ? (
          <>
            <div className="stat">
              Save these codes. They will not be shown again.
            </div>
            <div className="recovery-grid">
              {recoveryCodes.map((code, i) => (
                <code key={i}>{code}</code>
              ))}
            </div>
            <div className="mfa-actions">
              <Button normal boxy onClick={copyRecoveryCodes}>
                <IconCopy /> Copy
              </Button>
              <Button normal boxy onClick={() => setRecoveryCodes(null)}>
                <IconCheck /> Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="stat">
              {status?.hasRecoveryCodes
                ? 'Recovery codes are configured.'
                : 'No recovery codes generated.'}
            </div>
            <div className="mfa-actions">
              <Input
                placeholder="Password"
                type="password"
                value={recoveryPassword}
                onChange={setRecoveryPassword}
                onSubmit={
                  recoveryPassword && !busy ? generateRecovery : undefined
                }
              />
              <Button
                warn={!!status?.hasRecoveryCodes}
                main={!status?.hasRecoveryCodes}
                boxy
                disabled={!recoveryPassword || busy}
                onClick={generateRecovery}
              >
                <IconKey />{' '}
                {status?.hasRecoveryCodes ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
