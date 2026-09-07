import {
  formatChatFilter,
  parseChatQuery,
  parseQueryDate,
  quoteChatValue,
  type ChatQueryFilter,
} from '@backend/chatQuery';
import { Button, Calendar } from '@components';
import { useHasScope } from '@hooks';
import {
  IconArrowLeft,
  IconCalendar,
  IconMessage,
  IconSearch,
  IconShield,
  IconTerminal2,
  IconTrash,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Permissions } from '../../permissions';
import { trpc } from '../../trpc';

const RECENT_KEY = 'omegga:chat-search-history';
const RECENT_LIMIT = 8;

const FILTERS = [
  {
    key: 'from',
    Icon: IconUser,
    title: 'From a specific user',
    hint: 'from: user',
  },
  {
    key: 'role',
    Icon: IconShield,
    title: 'From anyone with a role',
    hint: 'role: Admin',
  },
  {
    key: 'admin',
    Icon: IconTerminal2,
    title: 'Sent from omegga by an admin',
    hint: 'admin: server',
  },
  {
    key: 'action',
    Icon: IconMessage,
    title: 'A specific kind of entry',
    hint: 'action: msg, join, leave, server, crash',
  },
  {
    key: 'before',
    Icon: IconCalendar,
    title: 'Sent before a date',
    hint: 'before: 2026-01-01',
  },
  {
    key: 'after',
    Icon: IconCalendar,
    title: 'Sent after a date',
    hint: 'after: 2026-01-01',
  },
];

const ACTIONS = [
  { value: 'msg', hint: 'chat messages' },
  { value: 'join', hint: 'players joining' },
  { value: 'leave', hint: 'players leaving' },
  { value: 'server', hint: 'server announcements' },
  { value: 'crash', hint: 'server crashes' },
];

type Option =
  | {
      kind: 'filter';
      id: string;
      key: string;
      title: string;
      hint: string;
      Icon: typeof IconUser;
    }
  | { kind: 'player'; id: string; name: string; displayName: string }
  | { kind: 'action'; id: string; value: string; hint: string }
  | { kind: 'role'; id: string; name: string }
  | { kind: 'admin'; id: string; value: string; hint: string }
  | { kind: 'back'; id: string }
  | { kind: 'recent'; id: string; query: string };

const readRecent = (): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter(s => typeof s === 'string')
      : [];
  } catch {
    // a private window or cleared site data reads back as unusable
    return [];
  }
};

const writeRecent = (searches: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(searches));
  } catch {
    // recent searches are a convenience; losing them is not worth an error
  }
};

/**
 * Split a raw query into the filters that render as badges and the free text
 * still being typed. Multi-word terms keep their quotes so re-serializing does
 * not silently turn one phrase into two terms.
 */
const splitQuery = (value: string) => {
  const parsed = parseChatQuery(value);
  return {
    badges: parsed.filters,
    text: parsed.terms.map(quoteChatValue).join(' '),
  };
};

export const SearchBar = ({
  value,
  onChange,
  onSubmit,
  onClear,
  senderNames,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear: () => void;
  /** player id to name, so a badge holding an id still reads as a name */
  senderNames?: Record<string, string>;
}) => {
  const canListPlayers = useHasScope(Permissions.PlayerList);
  const [focused, setFocused] = useState(false);
  // submitting or pressing escape hides the dropdown while the caret stays in
  // the field, so this is tracked apart from focus: otherwise the dropdown
  // would never return when typing resumes after a search
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [recent, setRecent] = useState<string[]>(readRecent);
  // names for the ids picked from the dropdown this session, so the badge reads
  // correctly before any results have come back to name them
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});
  const [badges, setBadges] = useState<ChatQueryFilter[]>(
    () => splitQuery(value).badges,
  );
  const [text, setText] = useState(() => splitQuery(value).text);
  const input = useRef<HTMLInputElement>(null);
  // the blur handler defers so a click on the dropdown can land first; holding
  // the timer lets an action that keeps focus cancel a blur already in flight
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // what this component last handed upward, so an echo of its own change is
  // not mistaken for the query being replaced from outside
  const emitted = useRef(value);

  useEffect(() => {
    if (value === emitted.current) return;
    const next = splitQuery(value);
    setBadges(next.badges);
    setText(next.text);
    emitted.current = value;
  }, [value]);

  const emit = (nextBadges: ChatQueryFilter[], nextText: string) => {
    // any edit means the field is in use again, so a dropdown dismissed by a
    // previous search comes back
    setDismissed(false);
    setBadges(nextBadges);
    setText(nextText);
    const combined = [...nextBadges.map(formatChatFilter), nextText]
      .filter(Boolean)
      .join(' ');
    emitted.current = combined;
    onChange(combined);
  };

  const token = text.split(/\s+/).pop() ?? '';
  const colon = token.indexOf(':');
  const tokenKey = colon > 0 ? token.slice(0, colon).toLowerCase() : '';
  const tokenValue = colon > 0 ? token.slice(colon + 1) : '';

  const wantsPlayers = tokenKey === 'from';
  const wantsRoles = tokenKey === 'role';
  const wantsAdmin = tokenKey === 'admin';
  const insideEmptyFilter =
    !tokenValue && FILTERS.some(f => f.key === tokenKey);
  const wantsDate = tokenKey === 'before' || tokenKey === 'after';

  // the picker opens on the month already typed, if any, else this month
  const typedDate = wantsDate ? parseQueryDate(tokenValue) : undefined;
  const [picker, setPicker] = useState<[number, number] | null>(null);
  const pickerDate = useMemo(() => {
    if (picker) return picker;
    const date = new Date(typedDate ?? Date.now());
    return [date.getFullYear(), date.getMonth()] as [number, number];
  }, [picker, typedDate]);
  const [pickerYear, pickerMonth] = pickerDate;

  const step = (months: number): [number, number] => {
    const date = new Date(pickerYear, pickerMonth + months, 1);
    return [date.getFullYear(), date.getMonth()];
  };
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(tokenValue), 200);
    return () => clearTimeout(timer);
  }, [tokenValue]);

  const { data } = trpc.player.list.useQuery(
    // closest name first; recency only breaks ties
    { search: wantsPlayers ? debounced : '', sort: 'relevance' },
    { enabled: canListPlayers && focused && wantsPlayers },
  );

  const { data: roleData } = trpc.player.roles.list.useQuery(undefined, {
    enabled: canListPlayers && focused && wantsRoles,
  });

  const canListUsers = useHasScope(Permissions.UserList);
  const { data: userData } = trpc.user.list.useQuery(
    { search: '', sort: 'name', direction: 1, page: 0 },
    { enabled: canListUsers && focused && wantsAdmin },
  );

  const options = useMemo((): Option[] => {
    // the calendar stands in for the option list, so there is nothing to rank
    if (wantsDate) return [];

    const back: Option[] = insideEmptyFilter
      ? [{ kind: 'back' as const, id: 'back' }]
      : [];

    if (wantsRoles) {
      const wanted = tokenValue.toLowerCase();
      return back.concat(
        (roleData ?? [])
          .filter(role => role.name.toLowerCase().includes(wanted))
          .slice(0, 6)
          .map(role => ({
            kind: 'role' as const,
            id: `role:${role.name}`,
            name: role.name,
          })),
      );
    }
    if (wantsPlayers) {
      return back.concat(
        (data?.players ?? []).slice(0, 6).map(player => ({
          kind: 'player' as const,
          id: player.id,
          name: player.name,
          displayName: player.displayName,
        })),
      );
    }

    if (wantsAdmin) {
      const wanted = tokenValue.toLowerCase();
      // the console is not an account, so it is offered alongside the users
      const console = { value: 'server', hint: "omegga's server console" };
      const users = (userData?.users ?? []).map(user => ({
        value: user.username,
        hint: user.isOwner ? 'owner' : 'web user',
      }));
      return back.concat(
        [console, ...users]
          .filter(a => a.value.toLowerCase().includes(wanted))
          .slice(0, 6)
          .map(a => ({ kind: 'admin' as const, id: `admin:${a.value}`, ...a })),
      );
    }

    if (tokenKey === 'action') {
      return back.concat(
        ACTIONS.filter(a => a.value.startsWith(tokenValue.toLowerCase())).map(
          a => ({ kind: 'action' as const, id: a.value, ...a }),
        ),
      );
    }

    // a partial key completes to the filter, so typing "act" offers "action:"
    const matches = FILTERS.filter(
      f => !token || (colon < 0 && f.key.startsWith(token.toLowerCase())),
    ).map(f => ({ kind: 'filter' as const, id: f.key, ...f }));

    if (!token && recent.length > 0)
      return [
        ...matches,
        ...recent.map(query => ({
          kind: 'recent' as const,
          id: `recent:${query}`,
          query,
        })),
      ];
    return matches;
  }, [
    wantsPlayers,
    wantsRoles,
    wantsAdmin,
    insideEmptyFilter,
    userData,
    wantsDate,
    data,
    roleData,
    tokenKey,
    tokenValue,
    token,
    colon,
    recent,
  ]);

  useEffect(() => setHighlight(-1), [token]);

  const replaceToken = (replacement: string) => {
    const parts = text.split(/(\s+)/);
    parts[parts.length - 1] = replacement;
    return parts.join('');
  };

  /** Drop the token being typed and add its filter as a badge. */
  const commitBadge = (key: string, badgeValue: string) => {
    const parts = text.split(/(\s+)/);
    parts[parts.length - 1] = '';
    emit(
      [...badges, { key, value: badgeValue } as ChatQueryFilter],
      parts.join(''),
    );
  };

  const apply = (option: Option) => {
    if (option.kind === 'filter') emit(badges, replaceToken(`${option.key}:`));
    else if (option.kind === 'player') {
      // pin the badge to this player rather than to a name several players can
      // match: "ember" also matches SeptemberGlow and EmbargoRunner
      setPickedNames(prev => ({ ...prev, [option.id]: option.name }));
      commitBadge('from', option.id);
    } else if (option.kind === 'action') commitBadge('action', option.value);
    else if (option.kind === 'role') commitBadge('role', option.name);
    else if (option.kind === 'admin') commitBadge('admin', option.value);
    // drop the half-typed filter and land back on the list it came from
    else if (option.kind === 'back') emit(badges, replaceToken(''));
    else if (option.kind === 'recent') {
      const next = splitQuery(option.query);
      emit(next.badges, next.text);
      submit(option.query);
      return;
    }
    keepFocus();
  };

  const submit = (query: string) => {
    const trimmed = query.trim();
    if (trimmed) {
      const next = [trimmed, ...recent.filter(r => r !== trimmed)].slice(
        0,
        RECENT_LIMIT,
      );
      setRecent(next);
      writeRecent(next);
    }
    setDismissed(true);
    onSubmit(query);
  };

  /** Focus the field and make sure a pending blur cannot close the dropdown. */
  const keepFocus = () => {
    clearTimeout(blurTimer.current);
    input.current?.focus();
    setFocused(true);
    setDismissed(false);
  };

  const removeBadge = (index: number) => {
    emit(
      badges.filter((_, i) => i !== index),
      text,
    );
    keepFocus();
  };

  const open = focused && !dismissed && (options.length > 0 || wantsDate);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && open) {
      e.preventDefault();
      apply(options[Math.max(highlight, 0)]);
      return;
    }

    // a complete filter typed by hand becomes a badge without the dropdown
    if (e.key === 'Tab' && tokenKey && tokenValue) {
      e.preventDefault();
      commitBadge(tokenKey, tokenValue);
      return;
    }

    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight(h => (h + 1) % options.length);
      return;
    }

    if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight(h => (h <= 0 ? options.length - 1 : h - 1));
      return;
    }

    if (e.key === 'Enter') {
      if (open && highlight >= 0) {
        e.preventDefault();
        apply(options[highlight]);
      } else {
        submit(
          [...badges.map(formatChatFilter), text].filter(Boolean).join(' '),
        );
      }
      return;
    }

    if (e.key === 'Escape') {
      setDismissed(true);
      return;
    }

    // backspace at the start of an empty field edits the badge before it, as
    // the name that was picked rather than the id it resolved to
    if (e.key === 'Backspace' && !text && badges.length > 0) {
      e.preventDefault();
      const last = badges[badges.length - 1];
      emit(badges.slice(0, -1), `${last.key}:${quoteChatValue(label(last))}`);
    }
  };

  /**
   * A from: badge holding a player id shows that player's name instead, and a
   * valueless admin: badge says what it actually means.
   */
  const label = (badge: ChatQueryFilter) =>
    (badge.key === 'from' &&
      (pickedNames[badge.value] ?? senderNames?.[badge.value])) ||
    badge.value ||
    (badge.key === 'admin' ? 'any' : '');

  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
  };

  const sectionFor = (option: Option) =>
    option.kind === 'back'
      ? ''
      : option.kind === 'player'
        ? 'Players'
        : option.kind === 'admin'
          ? 'Source'
          : option.kind === 'role'
            ? 'Roles'
            : option.kind === 'action'
              ? 'Kinds'
              : option.kind === 'recent'
                ? 'History'
                : 'Filters';

  return (
    <div className="chat-search">
      <div className="chat-search-row">
        <div
          className="chat-search-field"
          onClick={() => input.current?.focus()}
        >
          <IconSearch className="chat-search-icon" />
          {badges.map((badge, index) => (
            <span
              className="chat-search-badge"
              key={badge.key + badge.value + index}
            >
              {badge.key}: {label(badge)}
              <IconX
                className="chat-search-badge-remove"
                onMouseDown={e => {
                  e.preventDefault();
                  removeBadge(index);
                }}
              />
            </span>
          ))}
          <input
            ref={input}
            spellCheck="false"
            placeholder={badges.length > 0 ? '' : 'Search chat...'}
            value={text}
            onChange={e => emit(badges, e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              clearTimeout(blurTimer.current);
              setFocused(true);
              setDismissed(false);
            }}
            // let a click on the dropdown land before it unmounts
            onBlur={() => {
              blurTimer.current = setTimeout(() => setFocused(false), 150);
            }}
          />
        </div>
        {(badges.length > 0 || text.length > 0) && (
          <Button icon normal data-tooltip="Clear search" onClick={onClear}>
            <IconX />
          </Button>
        )}
      </div>

      {open && wantsDate && (
        <div
          className="chat-search-picker"
          // the month arrows are real buttons; without this they take focus
          // from the field and the deferred blur closes the picker underneath
          onMouseDown={e => e.preventDefault()}
        >
          {insideEmptyFilter && (
            <div
              className="chat-search-option"
              onMouseDown={() => apply({ kind: 'back', id: 'back' })}
            >
              <IconArrowLeft className="chat-search-option-icon" />
              <div className="chat-search-option-text">
                <span className="option-title">Back to filters</span>
              </div>
            </div>
          )}
          <Calendar
            year={pickerYear}
            month={pickerMonth}
            prevMonth={step(-1)}
            nextMonth={step(1)}
            prevYear={step(-12)}
            nextYear={step(12)}
            setDate={date => setPicker(date)}
            onPick={(year, month, day) => {
              // the same YYYY-MM-DD the parser reads as local midnight
              const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              commitBadge(tokenKey, iso);
              setPicker(null);
              keepFocus();
            }}
          />
        </div>
      )}

      {open && !wantsDate && (
        <div className="chat-search-dropdown">
          {options.map((option, index) => (
            <div key={option.id}>
              {sectionFor(option) &&
              (sectionFor(option) !==
                sectionFor(options[index - 1] ?? option) ||
                index === 0) ? (
                <div className="chat-search-section">
                  <span>{sectionFor(option)}</span>
                  {option.kind === 'recent' && (
                    <IconTrash
                      className="chat-search-clear"
                      onMouseDown={e => {
                        e.preventDefault();
                        clearRecent();
                      }}
                    />
                  )}
                </div>
              ) : null}
              <div
                className={`chat-search-option ${highlight === index ? 'highlighted' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={e => {
                  e.preventDefault();
                  apply(option);
                }}
              >
                {option.kind === 'filter' && (
                  <option.Icon className="chat-search-option-icon" />
                )}
                {option.kind === 'player' && (
                  <IconUser className="chat-search-option-icon" />
                )}
                {option.kind === 'action' && (
                  <IconMessage className="chat-search-option-icon" />
                )}
                {option.kind === 'role' && (
                  <IconShield className="chat-search-option-icon" />
                )}
                {option.kind === 'admin' && (
                  <IconTerminal2 className="chat-search-option-icon" />
                )}
                {option.kind === 'recent' && (
                  <IconSearch className="chat-search-option-icon" />
                )}
                {option.kind === 'back' && (
                  <IconArrowLeft className="chat-search-option-icon" />
                )}
                <div className="chat-search-option-text">
                  <span className="option-title">
                    {option.kind === 'filter' && option.title}
                    {option.kind === 'player' && option.name}
                    {option.kind === 'action' && `action: ${option.value}`}
                    {option.kind === 'role' && option.name}
                    {option.kind === 'admin' && option.value}
                    {option.kind === 'recent' && option.query}
                    {option.kind === 'back' && 'Back to filters'}
                  </span>
                  {option.kind === 'filter' && (
                    <span className="option-hint">{option.hint}</span>
                  )}
                  {option.kind === 'player' &&
                    option.displayName !== option.name && (
                      <span className="option-hint">{option.displayName}</span>
                    )}
                  {(option.kind === 'action' || option.kind === 'admin') && (
                    <span className="option-hint">{option.hint}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
