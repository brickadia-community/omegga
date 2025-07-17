import { IconCaretDown } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

export const Dropdown = ({
  disabled = false,
  options = [],
  value,
  onChange,
}: {
  disabled?: boolean;
  options: (string | number)[];
  value: string | number;
  onChange: (value: string | number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selfRef = useRef<HTMLDivElement>(null);

  // Hide the dropdown when clicking outside of it
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (e.target && !selfRef.current?.contains(e.target as Node)) {
        console.log('[debug] close');
        setOpen(false);
      }
    }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div className={`dropdown ${disabled ? 'disabled' : ''}`} ref={selfRef}>
      {open && (
        <div className="options">
          {options.map(o => (
            <div
              className={`option ${value === o ? 'green' : ''}`}
              key={o}
              onClick={() => {
                setOpen(false);
                onChange(o);
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
      <div
        className="selected"
        onClick={() => {
          !disabled && setOpen(o => !o);
        }}
      >
        <div className="value">{value}</div>
        <IconCaretDown />
      </div>
    </div>
  );
};
