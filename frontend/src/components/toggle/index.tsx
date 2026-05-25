import type React from 'react';

export const Toggle = ({
  disabled = false,
  value,
  onChange,
  tooltip,
  icon,
}: {
  disabled?: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
  tooltip?: string;
  icon?: React.ReactNode;
}) => (
  <div
    data-tooltip={tooltip}
    className={`toggle ${disabled ? 'disabled' : ''}`}
    onClick={() => onChange(!value)}
  >
    <div className={`toggle-slider ${value ? 'on' : ''}`}>
      {icon ?? <div className="symbol" />}
    </div>
  </div>
);
