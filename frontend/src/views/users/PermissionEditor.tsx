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
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`level-picker ${disabled ? 'dimmed' : ''}`}>
      {options.map((o, i) => (
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
            if (disabled || value === o.value) return;
            onChange(o.value);
          }}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const PermissionEditor = ({
  perms,
  onChange,
  defaultPerms,
  disabled,
}: {
  perms: PermissionSet;
  onChange: (p: PermissionSet) => void;
  defaultPerms?: PermissionSet | null;
  disabled?: boolean;
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const searchLower = search.toLowerCase();
  const hasSearch = searchLower.length > 0;

  const rootLocked = perms.root !== 'off';

  const setRoot = (root: RootLevel) => {
    if (root !== 'off') {
      onChange({ ...perms, root, domains: {}, scopes: {} });
    } else {
      onChange({ ...perms, root });
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
    onChange({ ...perms, domains, scopes });
  };

  const setScope = (scope: string, value: boolean) => {
    const scopes = { ...perms.scopes, [scope]: value };
    onChange({ ...perms, scopes });
  };

  const toggleExpanded = (domain: string) =>
    setExpanded(e => ({ ...e, [domain]: !e[domain] }));

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
    const result: Record<string, Permission[]> = {};
    for (const domain of DOMAIN_ORDER) {
      const scopes = SCOPES_BY_DOMAIN[domain] ?? [];
      const matches = scopes.filter(scope => {
        const info = SCOPE_INFO[scope];
        return (
          scope.toLowerCase().includes(searchLower) ||
          DOMAIN_LABELS[domain]?.toLowerCase().includes(searchLower) ||
          info?.description?.toLowerCase().includes(searchLower)
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
          <LevelPicker
            value={perms.root}
            options={ROOT_OPTIONS}
            onChange={setRoot}
            disabled={disabled}
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
              <LevelPicker
                value={domainLevel ?? 'none'}
                options={DOMAIN_OPTIONS}
                onChange={v => setDomain(domain, v)}
                disabled={disabled || rootLocked}
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
                        disabled={disabled || domainLocked}
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
