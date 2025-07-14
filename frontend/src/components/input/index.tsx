import type { FocusEventHandler } from 'react';

export function Input<T extends 'text' | 'number' | 'password' = 'text'>({
  placeholder,
  tooltip,
  disabled,
  type = 'text' as T,
  value,
  onBlur,
  onFocus,
  onChange,
}: {
  placeholder?: string;
  tooltip?: string;
  disabled?: boolean;
  type?: T;
  value: T extends 'number' ? number : string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onChange?: (v: T extends 'number' ? number : string) => void;
}) {
  return (
    <div
      className={`input ${disabled ? 'disabled' : ''}`}
      data-tooltip={tooltip}
    >
      <input
        spellCheck="false"
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onBlur={onBlur}
        onFocus={onFocus}
        onChange={e => {
          const newValue =
            type === 'number' ? Number(e.target.value) : e.target.value;
          if (onChange)
            onChange(newValue as T extends 'number' ? number : string);
        }}
      />
    </div>
  );
}
