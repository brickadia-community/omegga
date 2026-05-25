import type { HTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Input<T extends 'text' | 'number' | 'password'>({
  placeholder,
  tooltip,
  disabled,
  type = 'text' as T,
  value,
  roboto,
  onBlur,
  onFocus,
  onSubmit,
  onChange,
  ...props
}: {
  placeholder?: string;
  tooltip?: string;
  disabled?: boolean;
  roboto?: boolean;
  type?: T;
  value: T extends 'number' ? number : string;
  onSubmit?: () => void;
  onChange?: (v: T extends 'number' ? number : string) => void;
} & Omit<HTMLAttributes<HTMLInputElement>, 'onChange' | 'onSubmit'>) {
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
        onKeyDown={
          onSubmit
            ? e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                }
              }
            : undefined
        }
        {...props}
      />
    </div>
  );
}

export function TextArea({
  placeholder,
  disabled,
  value,
  rows = 3,
  onChange,
  ...props
}: {
  placeholder?: string;
  disabled?: boolean;
  value: string;
  rows?: number;
  onChange?: (v: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'>) {
  return (
    <div className={`input ${disabled ? 'disabled' : ''}`}>
      <textarea
        spellCheck="false"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        rows={rows}
        onChange={e => onChange?.(e.target.value)}
        {...props}
      />
    </div>
  );
}
