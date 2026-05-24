# Web UI Permission System

The web UI uses a hierarchical, purely additive permission model. Permissions can only grant access, never deny it.

## Data Model

Each user has a `PermissionSet`:

```ts
interface PermissionSet {
  root: 'all' | 'read' | 'off';
  domains: Partial<Record<Domain, 'all' | 'read'>>;
  scopes: Partial<Record<Scope, boolean>>;
}
```

A server-wide **default** `PermissionSet` serves as a fallback for all users.

## Resolution

When checking whether a user has a specific scope, the resolver walks four levels in order. The first level that produces a definite answer wins.

```
1. Owner bypass    - isOwner grants everything
2. Root level      - 'all' grants everything; 'read' grants read-only scopes; 'off' falls through
3. Domain level    - 'all' grants all scopes in that domain; 'read' grants read-only scopes; absent falls through
4. Scope level     - true grants; absent falls through to defaults
5. Default perms   - same root/domain/scope resolution, but with no further fallback
6. Not granted     - false
```

The `readOnly` flag on each scope definition determines whether "Read Only" mode at root or domain level grants that scope.

## Levels

### Root

| Value | UI Label | Behavior |
|-------|----------|----------|
| `all` | All | Grants every scope |
| `read` | Read Only | Grants only scopes marked `readOnly: true` |
| `off` | Manual | Falls through to domain and scope checks |

### Domain

| Value | UI Label | Behavior |
|-------|----------|----------|
| `all` | All | Grants every scope in this domain |
| `read` | Read Only | Grants only `readOnly` scopes in this domain |
| *(absent)* | Manual | Falls through to individual scope toggles |

Domains are purely additive. Setting a domain to "Manual" removes it from the `domains` map rather than storing a deny value.

### Scope

Permissions are purely additive. `true` grants the scope, absent (or toggled off) falls through to defaults. There is no way to explicitly deny a scope -- toggling a scope off simply removes the user-level override so the default applies.

## Domains and Scopes

Each scope belongs to exactly one domain and is either read-only (R) or read-write (W).

### Chat
| Scope | R/W | Description |
|-------|-----|-------------|
| `chat.send` | W | Send messages in the dashboard chat widget |
| `chat.recent` | R | View recent chat on the dashboard |
| `chat.history` | R | Browse past chat logs in the history view |
| `chat.calendar` | R | Navigate chat by date in the history view |

### Player
| Scope | R/W | Description |
|-------|-----|-------------|
| `player.list` | R | View the player list in the players view |
| `player.get` | R | Inspect player details and history |
| `player.ban` | W | Ban players from the player inspector |
| `player.kick` | W | Kick players from the player inspector |
| `player.unban` | W | Unban players from the player inspector |
| `player.clearBricks` | W | Clear a player's bricks from the player inspector |

### Plugin
| Scope | R/W | Description |
|-------|-----|-------------|
| `plugin.list` | R | View installed plugins in the plugins view |
| `plugin.get` | R | Inspect plugin details and configuration |
| `plugin.config` | W | Edit plugin settings in the plugin inspector |
| `plugin.load` | W | Load plugins from the plugin inspector |
| `plugin.unload` | W | Unload plugins from the plugin inspector |
| `plugin.toggle` | W | Enable or disable plugins in the plugins view |
| `plugin.reloadAll` | W | Reload all plugins from the plugins view |

### Server
| Scope | R/W | Description |
|-------|-----|-------------|
| `server.status` | R | View server status on the dashboard and server view |
| `server.start` | W | Start the server from the server view |
| `server.stop` | W | Stop the server from the server view |
| `server.restart` | W | Restart the server from the server view |
| `server.update.check` | W | Check for server updates in the server view (runs SteamCMD) |
| `server.update.run` | W | Run server updates from the server view |
| `server.autorestart.get` | R | View auto-restart settings in the server view |
| `server.autorestart.set` | W | Change auto-restart settings in the server view |
| `server.utilization` | R | View CPU, memory, and disk usage on the dashboard |

### User
| Scope | R/W | Description |
|-------|-----|-------------|
| `user.list` | R | View web UI user accounts in the users view |
| `user.create` | W | Create new user accounts in the users view |
| `user.passwd` | W | Change other users' passwords in the user inspector |
| `user.ban` | W | Disable or re-enable users in the user inspector |
| `user.delete` | W | Permanently delete user accounts |
| `user.permissions` | W | Edit user and default permissions in the users view |
| `user.readMfa` | R | View MFA status of other users in the user inspector |
| `user.resetMfa` | W | Reset MFA for other users in the user inspector |

### World
| Scope | R/W | Description |
|-------|-----|-------------|
| `world.list` | R | View available worlds in the worlds view |
| `world.active` | R | See which world is currently loaded |
| `world.next` | R | See which world will load next |
| `world.revisions` | R | View world save revisions in the world inspector |
| `world.meta` | R | View world metadata in the world inspector |
| `world.load` | W | Load worlds from the world inspector |
| `world.use` | W | Set the default world in the worlds view |
| `world.save` | W | Save the current world from the worlds or server view |
| `world.create` | W | Create new worlds in the worlds view |

## Self-Service

All authenticated users can access the `/account` page regardless of permissions. This page shows the user's own account info, MFA management (TOTP, passkeys, recovery codes), and password change.

The `user.self` endpoint (scoped to `session.info`) returns the current user's data without requiring `user.list`. The `user.passwd` endpoint allows any user to change their own password (requires current password); changing another user's password requires the `user.passwd` scope. MFA management endpoints (`mfa.*`) are scoped to `session.info` and require password verification for sensitive operations (TOTP setup/disable, passkey removal, recovery code generation).

## Enforcement

### Backend

Every tRPC endpoint is wrapped with `protectedProcedure(scope)`, which runs `requireScope` middleware. The middleware:

1. Rejects unauthenticated requests (`UNAUTHORIZED`)
2. Allows owners unconditionally
3. Resolves the scope against the user's permissions + server defaults
4. Rejects with `FORBIDDEN` if not granted

Subscription endpoints (like `server.onStatus`, `chat.onMessage`) share the scope of their corresponding query endpoint rather than having separate scopes.

### Frontend

On login, the session response includes `resolvedScopes` -- a flat `Record<string, boolean>` with every scope pre-resolved. The frontend stores this in a nanostore (`$resolvedScopes`).

- `useHasScope(...scopes)` -- returns true if the user has all specified scopes
- `useHasAnyScope(...scopes)` -- returns true if the user has any of the specified scopes
- `useRequireScope(scope)` -- redirects to `/` if the user lacks the scope

#### Sidenav Visibility

Each sidenav link is gated by a specific scope:

| Link | Required Scope | Always Visible |
|------|---------------|----------------|
| Dashboard | -- | Yes |
| Worlds | `world.list` | No |
| History | `chat.history` | No |
| Plugins | `plugin.list` | No |
| Players | `player.list` | No |
| Server | `server.status` | No |
| Users | `user.list` | No |
| Account | -- | Yes |

#### View Access

Each view redirects to the dashboard if the user lacks its required scope:
- Worlds requires `world.list`
- History requires `chat.history`
- Plugins requires `plugin.list`
- Players requires `player.list`
- Server requires `server.status`
- Users requires `user.list`

Within a view, individual buttons and controls are conditionally rendered based on their specific scopes. Admin actions in the user inspector (change password, disable, delete, reset MFA) are shown in an actions widget gated by their respective scopes.

The backend remains the source of truth -- frontend checks are for UX only.

## Privilege Escalation Prevention

When a non-owner user edits another user's permissions, the backend checks that the editor is not granting scopes they don't have themselves. The mutation resolves all scopes in the proposed `PermissionSet` against defaults and rejects any scope the editor lacks.

## Storage

User permissions are stored in the `users` NeDB store as part of each user document. Default permissions are stored in the `server` NeDB store as a `{ type: 'defaultPermissions' }` document.

New users are created with `EMPTY_PERMISSIONS` (`root: 'off', domains: {}, scopes: {}`), which means all access is determined by server defaults until explicitly configured.
