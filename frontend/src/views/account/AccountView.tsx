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
import { useHasScope } from '@hooks';
import { useStore } from '@nanostores/react';
import {
  IconCaretDown,
  IconCaretUp,
  IconLock,
  IconSignature,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Permissions } from '../../permissions';
import { $user } from '../../stores/user';
import { trpc } from '../../trpc';
import { UserInspector } from '../users/UserInspector';

export const AccountView = () => {
  const myUser = useStore($user);
  const passwdMutation = trpc.user.passwd.useMutation();
  const renameMutation = trpc.user.rename.useMutation();
  const utils = trpc.useUtils();

  const canRename = useHasScope(Permissions.UserRename);

  const [showActions, setShowActions] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [newUsername, setNewUsername] = useState('');

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

  const hideRename = () => {
    setShowRename(false);
    setRenameError('');
    setNewUsername('');
  };

  const submitRename = async () => {
    setRenameError('');
    setRenameLoading(true);
    try {
      const err = await renameMutation.mutateAsync({ username: newUsername });
      setRenameLoading(false);
      if (err) {
        setRenameError(err);
        return;
      }
      hideRename();
      // the username is part of the session info and the self query
      await Promise.all([
        utils.session.info.refetch(),
        utils.user.self.refetch(),
      ]);
    } catch (e) {
      console.error('error renaming user', e);
      setRenameLoading(false);
    }
  };

  const renameOk = useMemo(
    () => !!newUsername.match(/^\w{1,32}$/) && newUsername !== username,
    [newUsername, username],
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
            {canRename && (
              <Button
                info
                onClick={() => {
                  setShowActions(false);
                  setShowRename(true);
                }}
              >
                <IconSignature />
                Change Username
              </Button>
            )}
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
        <Dimmer visible={showRename}>
          <Loader active={renameLoading} size="huge">
            Submitting
          </Loader>
          <Modal visible={!renameLoading}>
            <Header>Change Username</Header>
            <PopoutContent>
              <p>
                Pick a new username. You will use it the next time you sign in.
              </p>
              {renameError && (
                <p style={{ color: 'red' }}>Error: {renameError}</p>
              )}
            </PopoutContent>
            <div className="popout-inputs">
              <Input
                placeholder="new username"
                type="text"
                value={newUsername}
                onChange={setNewUsername}
                onSubmit={renameOk ? submitRename : undefined}
              />
            </div>
            <Footer>
              <Button main disabled={!renameOk} onClick={submitRename}>
                <IconSignature />
                Rename
              </Button>
              <div style={{ flex: 1 }} />
              <Button normal onClick={hideRename}>
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
