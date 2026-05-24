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
4. Scope level     - true grants; false denies; absent falls through to defaults
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

Individual boolean toggles. `true` grants, `false` denies, absent falls through to defaults.

## Domains and Scopes

Each scope belongs to exactly one domain and is either read-only (R) or read-write (W).

### Chat
| Scope | R/W | Description |
|-------|-----|-------------|
| `chat.send` | W | Send chat messages |
| `chat.recent` | R | View recent chat messages |
| `chat.history` | R | View chat history |
| `chat.calendar` | R | View chat calendar |

### Player
| Scope | R/W | Description |
|-------|-----|-------------|
| `player.list` | R | View player list |
| `player.get` | R | View player details |
| `player.ban` | W | Ban players |
| `player.kick` | W | Kick players |
| `player.unban` | W | Unban players |
| `player.clearBricks` | W | Clear player bricks |

### Plugin
| Scope | R/W | Description |
|-------|-----|-------------|
| `plugin.list` | R | View plugin list |
| `plugin.get` | R | View plugin details |
| `plugin.config` | W | Change plugin configuration |
| `plugin.load` | W | Load plugins |
| `plugin.unload` | W | Unload plugins |
| `plugin.toggle` | W | Enable/disable plugins |
| `plugin.reloadAll` | W | Reload all plugins |

### Server
| Scope | R/W | Description |
|-------|-----|-------------|
| `server.status` | R | View server status, receive live status updates and heartbeat |
| `server.start` | W | Start the server |
| `server.stop` | W | Stop the server |
| `server.restart` | W | Restart the server |
| `server.update.check` | W | Check for server updates (runs SteamCMD) |
| `server.update.run` | W | Update the server |
| `server.autorestart.get` | R | View auto-restart config |
| `server.autorestart.set` | W | Change auto-restart config |
| `server.utilization` | R | View and receive live CPU, memory, and disk usage |

### User
| Scope | R/W | Description |
|-------|-----|-------------|
| `user.list` | R | View web UI users |
| `user.create` | W | Create web UI users |
| `user.passwd` | W | Change other users' passwords |
| `user.ban` | W | Disable/enable web UI users |
| `user.delete` | W | Delete web UI users |
| `user.permissions` | W | Manage user and default permissions |

### World
| Scope | R/W | Description |
|-------|-----|-------------|
| `world.list` | R | View world list |
| `world.active` | R | View active world |
| `world.next` | R | View next world |
| `world.revisions` | R | View world revisions |
| `world.meta` | R | View world metadata |
| `world.load` | W | Load worlds |
| `world.use` | W | Set default world |
| `world.save` | W | Save worlds |
| `world.create` | W | Create worlds |

## Self-Service

All authenticated users can access the Users page regardless of permissions. Users without `user.list` see a self-service view showing only their own account, where they can change their own password.

The `user.self` endpoint (scoped to `session.info`) returns the current user's data without requiring `user.list`. The `user.passwd` endpoint allows any user to change their own password; changing another user's password requires the `user.passwd` scope.

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
- `useHasAnyScope(domain?)` -- returns true if the user has any scope in the domain
- `useRequireDomain(domain)` -- redirects to `/` if the user has no scopes in the domain

Sidenav links are gated by `useHasAnyScope(domain)`, except Users which is always visible for self-service access. Views that require a domain redirect to the dashboard if the user has no scopes in that domain. Individual buttons and controls are conditionally rendered based on specific scopes.

The backend remains the source of truth -- frontend checks are for UX only.

## Privilege Escalation Prevention

When a non-owner user edits another user's permissions, the backend checks that the editor is not granting scopes they don't have themselves. The mutation resolves all scopes in the proposed `PermissionSet` against defaults and rejects any scope the editor lacks.

## Storage

User permissions are stored in the `users` NeDB store as part of each user document. Default permissions are stored in the `server` NeDB store as a `{ type: 'defaultPermissions' }` document.

New users are created with `EMPTY_PERMISSIONS` (`root: 'off', domains: {}, scopes: {}`), which means all access is determined by server defaults until explicitly configured.
