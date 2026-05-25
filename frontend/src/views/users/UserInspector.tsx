import {
  AnimatedDropdown,
  Button,
  Dimmer,
  Footer,
  Header,
  Input,
  Loader,
  Modal,
  NavBar,
  PopoutContent,
  Scroll,
  useConfirm,
} from '@components';
import { useHasScope } from '@hooks';
import { useStore } from '@nanostores/react';
import {
  IconBan,
  IconCaretDown,
  IconCaretUp,
  IconDeviceFloppy,
  IconKey,
  IconShieldOff,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { duration } from '@utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Permissions } from '../../permissions';
import { $resolvedScopes, $user, $usersRefresh } from '../../stores/user';
import { trpc, type RouterOutputs } from '../../trpc';

type UserFromList = RouterOutputs['user']['list']['users'][number];
type UserFromSelf = RouterOutputs['user']['self'];
type UserData = (UserFromList | UserFromSelf) & {
  totpEnabled?: boolean;
  passkeyCount?: number;
};

import { MfaManager } from './MfaManager';
import { PermissionEditor, type PermissionSet } from './PermissionEditor';
import { UserRoleSection } from './UserRoleSection';

export const UserInspector = ({
  selfUser,
}: {
  selfUser?: string;
  params?: any;
}) => {
  const [_match, params] = useRoute('/users/:id');
  const [_loc, navigate] = useLocation();
  const myUser = useStore($user);
  const resolvedScopes = useStore($resolvedScopes);

  const canEditPerms = useHasScope(Permissions.UserPermissions);
  const canBan = useHasScope(Permissions.UserBan);
  const canDelete = useHasScope(Permissions.UserDelete);
  const canPasswd = useHasScope(Permissions.UserPasswd);
  const canReadMfa = useHasScope(Permissions.UserReadMfa);
  const canResetMfa = useHasScope(Permissions.UserResetMfa);

  const isSelfMode = !!selfUser;
  const selectedUsername = selfUser ?? params?.id ?? '';

  const users = trpc.user.list.useQuery(undefined, {
    enabled: !isSelfMode,
  });
  const selfQuery = trpc.user.self.useQuery(undefined, {
    enabled: isSelfMode,
  });

  const user = useMemo((): UserData | null => {
    if (isSelfMode) {
      return selfQuery.data ?? null;
    }
    if (!users.data) return null;
    return users.data.users.find(u => u.username === selectedUsername) ?? null;
  }, [isSelfMode, selfQuery.data, users.data, selectedUsername]);

  const loading = isSelfMode ? selfQuery.isLoading : users.isLoading;

  const defaultPermsQuery = trpc.role.defaultPermissions.get.useQuery(
    undefined,
    { enabled: canEditPerms },
  );
  const permsMutation = trpc.user.permissions.useMutation();
  const banMutation = trpc.user.ban.useMutation();
  const deleteMutation = trpc.user.delete.useMutation();
  const passwdMutation = trpc.user.passwd.useMutation();
  const resetMfaMutation = trpc.user.resetMfa.useMutation();
  const banConfirm = useConfirm();
  const deleteConfirm = useConfirm();
  const resetMfaConfirm = useConfirm();

  const [editPerms, setEditPerms] = useState<PermissionSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [permError, setPermError] = useState('');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showPasswd, setShowPasswd] = useState(false);
  const [passwdLoading, setPasswdLoading] = useState(false);
  const [passwdError, setPasswdError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    if (user) {
      const root = user.permissions?.root;
      setEditPerms({
        root: root === 'all' || root === 'read' ? root : 'off',
        domains: (user.permissions?.domains as PermissionSet['domains']) ?? {},
        scopes: (user.permissions?.scopes as PermissionSet['scopes']) ?? {},
      });
    } else {
      setEditPerms(null);
    }
  }, [user?.username, user?.permissions]);

  useEffect(() => {
    if (!isSelfMode && !loading && !user && selectedUsername) {
      navigate('/users');
    }
  }, [isSelfMode, loading, user, selectedUsername]);

  const utils = trpc.useUtils();
  const savePerms = useCallback(async () => {
    if (!editPerms || !selectedUsername) return;
    setSaving(true);
    setPermError('');
    try {
      const err = await permsMutation.mutateAsync({
        username: selectedUsername,
        permissions: editPerms,
      });
      if (err) {
        setPermError(err);
      } else {
        await utils.user.list.refetch();
        if (isSelfMode) await selfQuery.refetch();
      }
    } catch (e: any) {
      setPermError(e?.message || 'Failed to save permissions');
    }
    setSaving(false);
  }, [editPerms, selectedUsername]);

  const dirty = useMemo(() => {
    if (!editPerms || !user?.permissions) return false;
    return JSON.stringify(editPerms) !== JSON.stringify(user.permissions);
  }, [editPerms, user?.permissions]);

  const handleBan = async (banned: boolean) => {
    const action = banned ? 'Disable' : 'Re-enable';
    if (
      !(await banConfirm.prompt(
        <>
          <p>
            {action} user <b>{selectedUsername}</b>?
          </p>
          <p>
            {banned
              ? 'Disabled users cannot sign in to the web UI.'
              : 'This will allow the user to sign in again.'}
          </p>
        </>,
      ))
    )
      return;
    const err = await banMutation.mutateAsync({
      username: selectedUsername,
      banned,
    });
    if (err) console.error('Failed to ban user:', err);
    else users.refetch();
  };

  const handleDelete = async () => {
    if (
      !(await deleteConfirm.prompt(
        <>
          <p>
            Permanently delete user <b>{selectedUsername}</b>?
          </p>
          <p>
            This will remove the account and all of its permissions. This action
            cannot be undone.
          </p>
        </>,
      ))
    )
      return;
    const err = await deleteMutation.mutateAsync({
      username: selectedUsername,
    });
    if (err) console.error('Failed to delete user:', err);
    else {
      navigate('/users');
      users.refetch();
      $usersRefresh.set($usersRefresh.get() + 1);
    }
  };

  const handleResetMfa = async () => {
    if (
      !(await resetMfaConfirm.prompt(
        <>
          <p>
            Reset MFA for <b>{selectedUsername}</b>?
          </p>
          <p>This will clear TOTP, passkeys, and recovery codes.</p>
        </>,
      ))
    )
      return;
    const err = await resetMfaMutation.mutateAsync({
      username: selectedUsername,
    });
    if (err) console.error('Failed to reset MFA:', err);
    else if (isSelfMode) selfQuery.refetch();
    else users.refetch();
  };

  const handlePasswd = async () => {
    setPasswdError('');
    if (newPassword !== confirmNewPassword) return;
    setPasswdLoading(true);
    try {
      const err = await passwdMutation.mutateAsync({
        username: selectedUsername,
        password: newPassword,
      });
      setPasswdLoading(false);
      if (err) {
        setPasswdError(err);
      } else {
        setShowPasswd(false);
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch {
      setPasswdLoading(false);
    }
  };

  const isSelf =
    (myUser?.username || 'Admin') === (selectedUsername || 'Admin');
  const hasMfa = user && (user.totpEnabled || (user.passkeyCount ?? 0) > 0);
  const hasAdminActions =
    user &&
    !user.isOwner &&
    !isSelf &&
    (canBan || canDelete || canPasswd || (canResetMfa && hasMfa));

  const defaultPerms = defaultPermsQuery.data
    ? ({
        root: defaultPermsQuery.data.root,
        domains: defaultPermsQuery.data.domains,
        scopes: defaultPermsQuery.data.scopes,
      } as PermissionSet)
    : null;

  const now = Date.now();

  return (
    <>
      <div className="player-inspector-container">
        <NavBar attached>
          {user?.username || (isSelfMode ? 'Account' : 'SELECT A USER')}
          <span style={{ flex: 1 }} />
          {user && canEditPerms && !user.isOwner && (
            <Button
              normal
              disabled={saving || !dirty}
              onClick={savePerms}
              data-tooltip="Save Permissions"
            >
              <IconDeviceFloppy />
              Save
            </Button>
          )}
        </NavBar>
        <div className="player-inspector">
          <div className="player-view">
            <Loader active={loading} size="huge">
              Loading User
            </Loader>
            <div className="player-info">
              {!loading && user && (
                <Scroll>
                  <div className="stats">
                    <div className="stat">
                      <b>Username:</b> {user.username || 'Admin'}
                    </div>
                    <div className="stat">
                      <b>Owner:</b> {user.isOwner ? 'Yes' : 'No'}
                    </div>
                    <div className="stat">
                      <b>Disabled:</b> {user.isBanned ? 'Yes' : 'No'}
                    </div>
                    <div className="stat">
                      <b>Last Active:</b>{' '}
                      {user.lastOnline
                        ? duration(now - user.lastOnline) + ' ago'
                        : 'Never'}
                    </div>
                    <div className="stat">
                      <b>Created:</b> {duration(now - user.created)} ago
                    </div>
                    {!isSelf && canReadMfa && (
                      <div className="stat">
                        <b>MFA:</b>{' '}
                        {user.totpEnabled || (user.passkeyCount ?? 0) > 0
                          ? [
                              user.totpEnabled && 'TOTP',
                              (user.passkeyCount ?? 0) > 0 &&
                                `${user.passkeyCount ?? 0} passkey(s)`,
                            ]
                              .filter(Boolean)
                              .join(' + ')
                          : 'Not configured'}
                      </div>
                    )}
                  </div>
                  {isSelfMode && <MfaManager />}
                  {!user.isOwner && (
                    <UserRoleSection
                      username={selectedUsername}
                      isSelf={isSelfMode}
                      roleIds={(user as any).roles ?? []}
                    />
                  )}
                  {canEditPerms && !user.isOwner && editPerms && (
                    <>
                      <div className="section-header">Permissions</div>
                      {permError && (
                        <div className="perm-error">{permError}</div>
                      )}
                      <PermissionEditor
                        perms={editPerms}
                        onChange={setEditPerms}
                        defaultPerms={defaultPerms}
                        actorScopes={
                          !myUser?.isOwner ? resolvedScopes : undefined
                        }
                      />
                    </>
                  )}
                  {user.isOwner && (
                    <>
                      <div className="section-header">Permissions</div>
                      <PermissionEditor
                        perms={{ root: 'all', domains: {}, scopes: {} }}
                        onChange={() => {}}
                        disabled
                      />
                    </>
                  )}
                </Scroll>
              )}
            </div>
          </div>
        </div>
        {hasAdminActions && (
          <Footer attached>
            <span style={{ flex: 1 }} />
            <div className="widgets-container">
              <Button
                normal
                boxy
                onClick={() => setShowActionsMenu(!showActionsMenu)}
              >
                {showActionsMenu ? <IconCaretDown /> : <IconCaretUp />}
                Actions
              </Button>
              <AnimatedDropdown
                visible={showActionsMenu}
                direction="up"
                className="widgets-list widgets-list-up"
              >
                {canPasswd && (
                  <Button
                    info
                    onClick={() => {
                      setShowActionsMenu(false);
                      setShowPasswd(true);
                    }}
                  >
                    <IconKey />
                    Change Password
                  </Button>
                )}
                {canBan && (
                  <Button
                    normal={!user.isBanned}
                    warn={!!user.isBanned}
                    onClick={() => {
                      setShowActionsMenu(false);
                      handleBan(!user.isBanned);
                    }}
                  >
                    <IconBan />
                    {user.isBanned ? 'Re-enable' : 'Disable'}
                  </Button>
                )}
                {canResetMfa && hasMfa && (
                  <Button
                    warn
                    onClick={() => {
                      setShowActionsMenu(false);
                      handleResetMfa();
                    }}
                  >
                    <IconShieldOff />
                    Reset MFA
                  </Button>
                )}
                {canDelete && (
                  <Button
                    error
                    onClick={() => {
                      setShowActionsMenu(false);
                      handleDelete();
                    }}
                  >
                    <IconTrash />
                    Delete
                  </Button>
                )}
              </AnimatedDropdown>
            </div>
          </Footer>
        )}
      </div>
      {banConfirm.children}
      {deleteConfirm.children}
      {resetMfaConfirm.children}
      <Dimmer visible={showPasswd}>
        <Loader active={passwdLoading} size="huge">
          Submitting
        </Loader>
        <Modal visible={!passwdLoading}>
          <Header>Change Password</Header>
          <PopoutContent>
            <p>
              Set a new password for <b>{selectedUsername}</b>.
            </p>
            {passwdError && (
              <p style={{ color: 'red' }}>Error: {passwdError}</p>
            )}
          </PopoutContent>
          <div className="popout-inputs">
            <Input
              placeholder="new password"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
            />
            <Input
              placeholder="confirm new password"
              type="password"
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
              onSubmit={
                newPassword.length && confirmNewPassword === newPassword
                  ? handlePasswd
                  : undefined
              }
            />
          </div>
          <Footer>
            <Button
              main
              disabled={
                !newPassword.length || confirmNewPassword !== newPassword
              }
              onClick={handlePasswd}
            >
              <IconKey />
              Update
            </Button>
            <div style={{ flex: 1 }} />
            <Button
              normal
              onClick={() => {
                setShowPasswd(false);
                setNewPassword('');
                setConfirmNewPassword('');
                setPasswdError('');
              }}
            >
              <IconX />
              Cancel
            </Button>
          </Footer>
        </Modal>
      </Dimmer>
    </>
  );
};
