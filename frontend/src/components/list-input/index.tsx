import { IconMinus, IconPlus } from '@tabler/icons-react';
import { Button } from '../button';
import { Dropdown } from '../dropdown';
import { Input } from '../input';
import { RoleDropdown } from '../role-dropdown';

export type ListInputType = 'string' | 'password' | 'number' | 'enum' | 'role';

export const ListInput = ({
  placeholder = '',
  disabled = false,
  type,
  value = [],
  options = [],
  onChange,
}: {
  placeholder?: string;
  disabled?: boolean;
  type: ListInputType;
  value: any[];
  options?: any[];
  onChange: (value: any[]) => void;
}) => {
  const updateItem = (index: number, val: any) => {
    const clone = value.slice();
    clone[index] = val;
    onChange(clone);
  };

  const addItem = () => {
    const clone = value.slice();
    clone.push(
      {
        string: '',
        number: 0,
        password: '',
        role: '',
        enum: options && options[0],
      }[type]
    );
    onChange(clone);
  };

  const removeItem = (index: number) => {
    const clone = value.slice();
    clone.splice(index, 1);
    onChange(clone);
  };

  return (
    <div className={`br-list-input ${disabled ? 'disabled' : ''}`}>
      {(value || []).map((v, i) => (
        <div className="br-list-item" key={i}>
          {(type === 'string' || type === 'password' || type === 'number') && (
            <Input
              value={v}
              onChange={v => updateItem(i, v)}
              placeholder={placeholder}
              type={type === 'string' ? 'text' : type}
              disabled={disabled}
            />
          )}
          {type === 'enum' && (
            <Dropdown
              value={v}
              options={options}
              onChange={val => updateItem(i, val)}
              disabled={disabled}
            />
          )}
          {type === 'role' && (
            <RoleDropdown
              value={v}
              onChange={val => updateItem(i, val)}
              disabled={disabled}
            />
          )}
          <Button
            icon
            warn
            data-tooltip="Remove this item from the list"
            onClick={() => removeItem(i)}
            disabled={disabled}
          >
            <IconMinus />
          </Button>
        </div>
      ))}
      <Button
        icon
        main
        data-tooltip="Add an item to the list"
        onClick={addItem}
        disabled={disabled}
      >
        <IconPlus />
      </Button>
    </div>
  );
};
