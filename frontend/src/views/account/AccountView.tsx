import {
  AnimatedDropdown,
  Button,
  Dimmer,
  Footer,
  Header,
  Input,
  Loader,
  Modal,
  NavHeader,
  PageContent,
  PopoutContent,
  SideNav,
} from '@components';
import { useStore } from '@nanostores/react';
import {
  IconCaretDown,
  IconCaretUp,
  IconLock,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { $user } from '../../stores/user';
import { trpc } from '../../trpc';
import { UserInspector } from '../users/UserInspector';

export const AccountView = () => {
  const myUser = useStore($user);
  const passwdMutation = trpc.user.passwd.useMutation();

  const [showActions, setShowActions] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const username = myUser?.username ?? '';

  const hideModal = () => {
    setShowCredentials(false);
    setError('');
    setCurrentPassword('');
    setPassword('');
    setConfirmPassword('');
  };

  const submit = async () => {
    setError('');
    if (password !== confirmPassword) return;
    setModalLoading(true);
    try {
      const err = await passwdMutation.mutateAsync({
        username,
        password,
        currentPassword,
      });
      setModalLoading(false);
      if (!err) {
        hideModal();
        return;
      }
      setError(err);
    } catch (e) {
      console.error('error setting password', e);
      setModalLoading(false);
    }
  };

  const ok = useMemo(
    () =>
      currentPassword.length > 0 &&
      password.length > 0 &&
      confirmPassword === password,
    [currentPassword, password, confirmPassword],
  );

  return (
    <>
      <NavHeader title="Account">
        <div className="widgets-container">
          <Button normal boxy onClick={() => setShowActions(!showActions)}>
            {showActions ? <IconCaretUp /> : <IconCaretDown />}
            Actions
          </Button>
          <AnimatedDropdown visible={showActions}>
            <Button
              info
              onClick={() => {
                setShowActions(false);
                setShowCredentials(true);
              }}
            >
              <IconLock />
              Change Password
            </Button>
          </AnimatedDropdown>
        </div>
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container players-container">
          <UserInspector selfUser={username} />
        </div>
        <Dimmer visible={showCredentials}>
          <Loader active={modalLoading} size="huge">
            Submitting
          </Loader>
          <Modal visible={!modalLoading}>
            <Header>Change Password</Header>
            <PopoutContent>
              {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            </PopoutContent>
            <div className="popout-inputs">
              <Input
                placeholder="current password"
                type="password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />
              <Input
                placeholder="new password"
                type="password"
                value={password}
                onChange={setPassword}
              />
              <Input
                placeholder="confirm new password"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                onSubmit={ok ? submit : undefined}
              />
            </div>
            <Footer>
              <Button main disabled={!ok} onClick={submit}>
                <IconLock />
                Update
              </Button>
              <div style={{ flex: 1 }} />
              <Button normal onClick={hideModal}>
                <IconX />
                Cancel
              </Button>
            </Footer>
          </Modal>
        </Dimmer>
      </PageContent>
    </>
  );
};
