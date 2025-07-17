import type { BRRoleSetupEntry } from '@omegga/brickadia/types';
import { IconCaretDown } from '@tabler/icons-react';
import type React from 'react';
import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { rpcReq } from '../../socket';
import { Loader } from '../loader';

export const RoleDropdown = ({
  disabled = false,
  value,
  onChange,
  ...props
}: React.PropsWithChildren<{
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
}> &
  HTMLAttributes<HTMLDivElement>) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function fetchRoles() {
    setLoading(true);
    setOptions([]);
    const roles: BRRoleSetupEntry[] = await rpcReq('roles.list');
    setOptions(roles.map(role => role.name));
    setLoading(false);
  }

  // Hide the dropdown when clicking outside of it
  useEffect(() => {
    if (!open) return;

    function handler(e: MouseEvent) {
      if (e.target && !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div
      className={`role-dropdown ${disabled ? 'disabled' : ''}`}
      ref={ref}
      {...props}
    >
      {open && (
        <div className="options">
          {loading && (
            <div className="option search" style={{ position: 'relative' }}>
              <Loader active size="small" />
            </div>
          )}
          {options.map(o => (
            <div
              key={o}
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className={`option ${value === o ? 'green' : ''}`}
            >
              {o}
            </div>
          ))}
        </div>
      )}
      <div
        className="selected"
        onClick={() => {
          setOpen(o => !o);
          if (!open) fetchRoles();
        }}
      >
        <div className="value">{value}</div>
        <IconCaretDown />
      </div>
    </div>
  );
};
