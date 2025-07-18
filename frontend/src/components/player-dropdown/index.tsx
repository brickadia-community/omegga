import { IconMinus } from '@tabler/icons-react';
import { debounce } from '@utils';
import type React from 'react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from 'react';
import { Link } from 'wouter';
import { rpcReq } from '../../socket';
import { Button } from '../button';
import { Input } from '../input';
import { Loader } from '../loader';

export const PlayerDropdown = ({
  disabled = false,
  value,
  placeholder,
  onChange,
  ...props
}: React.PropsWithChildren<{
  disabled?: boolean;
  placeholder?: string;
  value: { id: string; name: string }[];
  onChange: (value: { id: string; name: string }[]) => void;
}> &
  HTMLAttributes<HTMLDivElement>) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

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

  function removeItem(i: number) {
    const next = value.slice();
    next.splice(i, 1);
    onChange(next);
  }

  function addItem({ id, name }: { id: string; name: string }) {
    onChange([...value, { id, name }]);
    setOpen(false);
    setSearch('');
  }

  const searchRef = useRef(search);
  searchRef.current = search;
  const doSearch = useMemo(
    () =>
      debounce(async () => {
        if (searchRef.current.length === 0) {
          setOpen(false);
          setLoading(false);
          setOptions([]);
          return;
        }

        setLoading(true);
        setOpen(true);
        const { players } = await rpcReq('players.list', {
          page: 0,
          search: searchRef.current,
          sort: 'lastSeen',
          direction: -1,
          filter: '',
        });
        setOptions(players);
        setLoading(false);
      }, 500),
    [],
  );

  return (
    <div className={`br-player-list ${disabled ? 'disabled' : ''}`} {...props}>
      {value.map((v, i) => (
        <div className="br-player-item" key={v.id}>
          <Link
            href={`/players/${v.id}`}
            className="selected"
            data-tooltip="Click to navigate to player page"
          >
            {v.name}
          </Link>
          <Button
            icon
            warn
            data-tooltip="Remove this player from the list"
            onClick={() => removeItem(i)}
          >
            <IconMinus />
          </Button>
        </div>
      ))}
      <div className="player-search" ref={ref}>
        <Input
          type="text"
          placeholder="Search Players..."
          value={search}
          onChange={value => {
            setSearch(value);
            doSearch();
          }}
        />
        {open && (
          <div className="options">
            {loading && (
              <div className="option search" style={{ position: 'relative' }}>
                <Loader active size="small" />
              </div>
            )}
            {options.map(o => (
              <div key={o.id} onClick={() => addItem(o)} className="option">
                {o.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
