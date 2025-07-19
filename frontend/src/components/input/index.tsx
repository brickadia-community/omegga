import type { HTMLAttributes } from 'react';

export function Input<T extends 'text' | 'number' | 'password'>({
  placeholder,
  tooltip,
  disabled,
  type = 'text' as T,
  value,
  roboto,
  onBlur,
  onFocus,
  onChange,
  ...props
}: {
  placeholder?: string;
  tooltip?: string;
  disabled?: boolean;
  roboto?: boolean;
  type?: T;
  value: T extends 'number' ? number : string;
  onChange?: (v: T extends 'number' ? number : string) => void;
} & Omit<HTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <div
      className={`input ${disabled ? 'disabled' : ''} ${roboto ? 'roboto' : ''}`}
      data-tooltip={tooltip}
    >
      <input
        spellCheck="false"
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={e => {
          const newValue =
            type === 'number' ? Number(e.target.value) : e.target.value;
          if (onChange)
            onChange(newValue as T extends 'number' ? number : string);
        }}
        {...props}
      />
    </div>
  );
}
