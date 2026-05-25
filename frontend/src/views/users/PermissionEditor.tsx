import { Input, Toggle } from '@components';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import {
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  SCOPE_INFO,
  SCOPES_BY_DOMAIN,
  type Permission,
} from '../../permissions';

export type DomainLevel = 'all' | 'read' | 'none';
export type RootLevel = 'all' | 'read' | 'off';

export interface PermissionSet {
  root: RootLevel;
  domains: Record<string, DomainLevel>;
  scopes: Record<string, boolean>;
}

export function mergePermissionSets(
  ...sets: PermissionSet[]
): PermissionSet {
  let root: RootLevel = 'off';
  const domains: Record<string, DomainLevel> = {};
  const scopes: Record<string, boolean> = {};
  const ROOT_RANK: Record<string, number> = { off: 0, read: 1, all: 2 };
  const DOMAIN_RANK: Record<string, number> = { none: 0, read: 1, all: 2 };
  for (const s of sets) {
    if ((ROOT_RANK[s.root] ?? 0) > (ROOT_RANK[root] ?? 0)) root = s.root;
    for (const [d, l] of Object.entries(s.domains ?? {})) {
      if ((DOMAIN_RANK[l] ?? 0) > (DOMAIN_RANK[domains[d]] ?? 0))
        domains[d] = l;
    }
    for (const [sc, v] of Object.entries(s.scopes ?? {})) {
      if (v) scopes[sc] = true;
    }
  }
  return { root, domains, scopes };
}

export function resolveEffective(p: PermissionSet): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [scope, info] of Object.entries(SCOPE_INFO)) {
    if (p.root === 'all') { result[scope] = true; continue; }
    if (p.root === 'read' && info.readOnly) { result[scope] = true; continue; }
    const dl = p.domains[info.domain];
    if (dl === 'all') { result[scope] = true; continue; }
    if (dl === 'read' && info.readOnly) { result[scope] = true; continue; }
    result[scope] = p.scopes[scope] ?? false;
  }
  return result;
}

function wouldRevoke(current: PermissionSet, proposed: PermissionSet): boolean {
  const cur = resolveEffective(current);
  const next = resolveEffective(proposed);
  return Object.keys(cur).some(s => cur[s] && !next[s]);
}

function wouldEscalate(
  proposed: PermissionSet,
  actor: Record<string, boolean>,
): boolean {
  const next = resolveEffective(proposed);
  return Object.keys(next).some(s => next[s] && !actor[s]);
}

const ROOT_OPTIONS: { value: RootLevel; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read Only' },
  { value: 'off', label: 'Manual' },
];
const DOMAIN_OPTIONS: { value: DomainLevel; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read Only' },
  { value: 'none', label: 'Manual' },
];

function LevelPicker<T extends string>({
  value,
  options,
  onChange,
  disabled,
  disabledOptions,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  disabledOptions?: Set<T>;
}) {
  return (
    <div className={`level-picker ${disabled ? 'dimmed' : ''}`}>
      {options.map((o, i) => {
        const optDisabled = disabled || disabledOptions?.has(o.value);
        return (
          <button
            key={o.value}
            className={[
              'level-option',
              value === o.value ? 'active' : '',
              `level-${o.value}`,
              i === 0 ? 'first' : '',
              i === options.length - 1 ? 'last' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (optDisabled || value === o.value) return;
              onChange(o.value);
            }}
            disabled={!!optDisabled}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const PermissionEditor = ({
  perms,
  onChange,
  defaultPerms,
  disabled,
  actorScopes,
}: {
  perms: PermissionSet;
  onChange?: (p: PermissionSet) => void;
  defaultPerms?: PermissionSet | null;
  disabled?: boolean;
  actorScopes?: Record<string, boolean>;
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const searchLower = search.toLowerCase();
  const hasSearch = searchLower.length > 0;

  const readOnly = !onChange;
  const rootLocked = perms.root !== 'off';

  const disabledRootOptions = useMemo(() => {
    if (!actorScopes) return undefined;
    const set = new Set<RootLevel>();
    for (const opt of ['all', 'read', 'off'] as RootLevel[]) {
      if (opt === perms.root) continue;
      const proposed: PermissionSet =
        opt !== 'off'
          ? { root: opt, domains: {}, scopes: {} }
          : { ...perms, root: opt };
      if (wouldEscalate(proposed, actorScopes) || wouldRevoke(perms, proposed))
        set.add(opt);
    }
    if (set.size >= 2) set.add(perms.root);
    return set.size > 0 ? set : undefined;
  }, [actorScopes, perms]);

  const disabledDomainOptions = useMemo(() => {
    if (!actorScopes) return {};
    const result: Record<string, Set<DomainLevel>> = {};
    for (const domain of DOMAIN_ORDER) {
      const currentDl = perms.domains[domain] ?? 'none';
      const set = new Set<DomainLevel>();
      for (const opt of ['all', 'read', 'none'] as DomainLevel[]) {
        if (opt === currentDl) continue;
        const domains = { ...perms.domains };
        const scopes = { ...perms.scopes };
        if (opt !== 'none') {
          domains[domain] = opt;
          for (const s of SCOPES_BY_DOMAIN[domain] ?? []) delete scopes[s];
        } else {
          delete domains[domain];
        }
        const proposed: PermissionSet = { ...perms, domains, scopes };
        if (
          wouldEscalate(proposed, actorScopes) || wouldRevoke(perms, proposed)
        )
          set.add(opt);
      }
      if (set.size >= 2) set.add(currentDl);
      if (set.size > 0) result[domain] = set;
    }
    return result;
  }, [actorScopes, perms]);

  const allScopeKeys = Object.keys(SCOPE_INFO) as Permission[];
  const totalScopes = allScopeKeys.length;
  const totalEnabled = useMemo(() => {
    if (perms.root === 'all') return totalScopes;
    let count = 0;
    for (const scope of allScopeKeys) {
      const info = SCOPE_INFO[scope];
      if (!info) continue;
      if (perms.root === 'read' && info.readOnly) {
        count++;
        continue;
      }
      const dl = perms.domains[info.domain];
      if (dl === 'all') {
        count++;
        continue;
      }
      if (dl === 'read' && info.readOnly) {
        count++;
        continue;
      }
      if (perms.scopes[scope]) {
        count++;
      }
    }
    return count;
  }, [perms]);

  const setRoot = (root: RootLevel) => {
    if (root !== 'off') {
      onChange?.({ ...perms, root, domains: {}, scopes: {} });
    } else {
      onChange?.({ ...perms, root });
    }
  };

  const setDomain = (domain: string, level: DomainLevel) => {
    const domains = { ...perms.domains };
    const scopes = { ...perms.scopes };
    if (level !== 'none') {
      domains[domain] = level;
      for (const s of SCOPES_BY_DOMAIN[domain] ?? []) delete scopes[s];
    } else {
      delete domains[domain];
    }
    onChange?.({ ...perms, domains, scopes });
  };

  const setScope = (scope: string, value: boolean) => {
    const scopes = { ...perms.scopes };
    if (value) scopes[scope] = true;
    else delete scopes[scope];
    onChange?.({ ...perms, scopes });
  };

  const toggleExpanded = (domain: string) =>
    setExpanded(e => ({ ...e, [domain]: e[domain] === false }));

  const effectiveForScope = (scope: Permission): boolean | null => {
    if (!defaultPerms) return null;
    const info = SCOPE_INFO[scope];
    if (!info) return null;
    if (defaultPerms.root === 'all') return true;
    if (defaultPerms.root === 'read') return info.readOnly;
    const dl = defaultPerms.domains[info.domain];
    if (dl === 'all') return true;
    if (dl === 'read') return info.readOnly;
    return defaultPerms.scopes[scope] ?? false;
  };

  const matchingDomains = useMemo(() => {
    if (!hasSearch) return null;
    const pattern = new RegExp(
      searchLower
        .split(/\s+/)
        .filter(Boolean)
        .map(w => `(?=.*${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)
        .join(''),
      'i',
    );
    const matchesSearch = (text: string) => pattern.test(text);
    const result: Record<string, Permission[]> = {};
    for (const domain of DOMAIN_ORDER) {
      const scopes = SCOPES_BY_DOMAIN[domain] ?? [];
      const matches = scopes.filter(scope => {
        const info = SCOPE_INFO[scope];
        return (
          matchesSearch(scope) ||
          matchesSearch(DOMAIN_LABELS[domain] ?? '') ||
          matchesSearch(info?.description ?? '')
        );
      });
      if (matches.length > 0) result[domain] = matches;
    }
    return result;
  }, [searchLower, hasSearch]);

  return (
    <div className="permission-editor">
      <div className="perm-search">
        <Input
          type="text"
          placeholder="Search Permissions..."
          value={search}
          onChange={setSearch}
        />
      </div>
      {!hasSearch && (
        <div className="perm-row root-row">
          <span className="perm-label root-label">Everything</span>
          <span className="scope-count">
            {totalEnabled}/{totalScopes}
          </span>
          <LevelPicker
            value={perms.root}
            options={ROOT_OPTIONS}
            onChange={setRoot}
            disabled={disabled || readOnly}
            disabledOptions={disabledRootOptions}
          />
        </div>
      )}
      {DOMAIN_ORDER.map(domain => {
        const domainLevel = perms.domains[domain];
        const domainLocked =
          rootLocked || domainLevel === 'all' || domainLevel === 'read';
        const allScopes = SCOPES_BY_DOMAIN[domain] ?? [];
        const scopes = hasSearch
          ? (matchingDomains?.[domain] ?? [])
          : allScopes;
        if (hasSearch && scopes.length === 0) return null;
        const isExpanded = hasSearch || expanded[domain] !== false;
        const enabledCount =
          perms.root === 'all' || domainLevel === 'all'
            ? allScopes.length
            : perms.root === 'read' || domainLevel === 'read'
              ? allScopes.filter(
                  s => SCOPE_INFO[s]?.readOnly || perms.scopes[s],
                ).length
              : allScopes.filter(s => perms.scopes[s]).length;

        return (
          <div className="perm-domain" key={domain}>
            <div className="perm-row domain-row">
              <span
                className="perm-label domain-label"
                onClick={() => toggleExpanded(domain)}
              >
                {isExpanded ? (
                  <IconChevronDown size={16} />
                ) : (
                  <IconChevronRight size={16} />
                )}{' '}
                {DOMAIN_LABELS[domain]}
              </span>
              <span className="scope-count">
                {enabledCount}/{allScopes.length}
              </span>
              <LevelPicker
                value={domainLevel ?? 'none'}
                options={DOMAIN_OPTIONS}
                onChange={v => setDomain(domain, v)}
                disabled={disabled || readOnly || rootLocked}
                disabledOptions={disabledDomainOptions[domain]}
              />
            </div>
            {isExpanded &&
              scopes.map((scope, i) => {
                const info = SCOPE_INFO[scope];
                const scopeVal = perms.scopes[scope] ?? false;
                const inherited = effectiveForScope(scope);
                return (
                  <div
                    className={`perm-row scope-row ${i % 2 === 0 ? 'even' : 'odd'}`}
                    key={scope}
                  >
                    <div className="scope-info">
                      <span className="scope-name">
                        <span
                          className={`scope-badge ${info?.readOnly ? 'read' : 'write'}`}
                          data-tooltip={
                            info?.readOnly ? 'Read-only' : 'Read/Write'
                          }
                        >
                          {info?.readOnly ? 'R' : 'W'}
                        </span>
                        {scope.split('.').slice(1).join('.')}
                      </span>
                      <span className="scope-desc">{info?.description}</span>
                    </div>
                    <div className="scope-controls">
                      {inherited === true && (
                        <span
                          className="inherited on"
                          data-tooltip="Granted by defaults"
                        >
                          <IconCheck size={14} />
                        </span>
                      )}
                      <Toggle
                        value={scopeVal}
                        onChange={v => setScope(scope, v)}
                        disabled={
                          disabled ||
                          readOnly ||
                          domainLocked ||
                          (actorScopes &&
                            (scopeVal || !actorScopes[scope]))
                        }
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
};
