export const Toggle = ({
  disabled = false,
  value,
  onChange,
  tooltip,
}: {
  disabled?: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
  tooltip?: string;
}) => (
  <div
    data-tooltip={tooltip}
    className={`toggle ${disabled ? 'disabled' : ''}`}
    onClick={() => onChange(!value)}
  >
    <div className={`toggle-slider ${value ? 'on' : ''}`}>
      <div className="symbol" />
    </div>
  </div>
);
