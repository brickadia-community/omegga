/**
 * Parser for the chat history search box, in the shape discord and slack use:
 * `from:someone before:2026-01-01 words to look for`.
 *
 * Lives under the backend but is imported by the web UI too, so it must stay
 * free of node builtins and of anything that pulls in the database.
 */

export type ChatSearchAction = 'msg' | 'server' | 'leave' | 'join' | 'crash';

const ACTIONS: ChatSearchAction[] = ['msg', 'server', 'leave', 'join', 'crash'];

const FILTER_KEYS = ['from', 'role', 'admin', 'before', 'after', 'action'];

/** A `key:value` pair the parser recognised, kept with the text that produced it. */
export interface ChatQueryFilter {
  key: 'from' | 'role' | 'admin' | 'before' | 'after' | 'action';
  /** the raw text after the colon, for echoing the term back in the UI */
  value: string;
}

export interface ParsedChatQuery {
  /** words to match against the message body, with quotes stripped */
  terms: string[];
  /** names or ids to resolve to senders; empty means every sender */
  from: string[];
  /** server role names whose holders to limit the search to */
  roles: string[];
  /** epoch ms, exclusive upper bound */
  before?: number;
  /** epoch ms, exclusive lower bound */
  after?: number;
  /** kinds of entry to include; empty means the default of messages only */
  actions: ChatSearchAction[];
  /**
   * Names of omegga web users whose messages to keep, with `server` standing
   * for the server console. Empty means no such filter.
   */
  admin: string[];
  /** `admin:` with no name: anything omegga sent, whoever sent it. */
  adminAny?: boolean;
  /** every recognised filter in the order typed, for rendering chips */
  filters: ChatQueryFilter[];
}

/**
 * Splits on whitespace, but keeps `"quoted phrases"` together, including when
 * they follow a filter (`from:"two words"`). An unterminated quote runs to the
 * end of the input so the search still fires while the user is mid-word.
 */
const tokenize = (input: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of input) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
};

/**
 * `YYYY-MM-DD` is read in the viewer's own timezone rather than UTC, so
 * `before:2026-01-01` means midnight as the person typing it experiences it.
 * Anything else falls back to Date's own parsing; a bare epoch is accepted too.
 */
export const parseQueryDate = (value: string): number | undefined => {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymd) {
    const [, year, month, day] = ymd;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? undefined : date.getTime();
  }
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
};

/**
 * Reads a search box into filters and search terms. A `key:value` whose value
 * makes no sense (`before:soon`) stays a search term rather than erroring, so
 * pasting a url or a timestamp into the box never turns into a failed search.
 */
export const parseChatQuery = (input: string): ParsedChatQuery => {
  const parsed: ParsedChatQuery = {
    terms: [],
    from: [],
    roles: [],
    admin: [],
    actions: [],
    filters: [],
  };

  for (const token of tokenize(input)) {
    const colon = token.indexOf(':');
    const key = colon > 0 ? token.slice(0, colon).toLowerCase() : '';
    const value = colon > 0 ? token.slice(colon + 1) : '';

    if (!value) {
      // `admin:` on its own means everything omegga sent. every other bare
      // filter is one the user is still typing: picking a filter from the
      // dropdown inserts exactly that
      if (key === 'admin' && !parsed.adminAny) {
        parsed.adminAny = true;
        parsed.filters.push({ key: 'admin', value: '' });
      } else if (token && !FILTER_KEYS.includes(key)) parsed.terms.push(token);
      continue;
    }

    if (key === 'from') {
      parsed.from.push(value);
      parsed.filters.push({ key: 'from', value });
      continue;
    }

    if (key === 'role') {
      parsed.roles.push(value);
      parsed.filters.push({ key: 'role', value });
      continue;
    }

    if (key === 'before' || key === 'after') {
      const date = parseQueryDate(value);
      if (date === undefined) {
        parsed.terms.push(token);
        continue;
      }
      parsed[key] = date;
      parsed.filters.push({ key, value });
      continue;
    }

    if (key === 'admin') {
      parsed.admin.push(value);
      parsed.filters.push({ key: 'admin', value });
      continue;
    }

    if (key === 'action') {
      const action = value.toLowerCase() as ChatSearchAction;
      if (!ACTIONS.includes(action)) {
        parsed.terms.push(token);
        continue;
      }
      // repeating a filter widens the search rather than replacing it, so
      // `action:join action:leave` finds both
      if (!parsed.actions.includes(action)) {
        parsed.actions.push(action);
        parsed.filters.push({ key: 'action', value: action });
      }
      continue;
    }

    parsed.terms.push(token);
  }

  return parsed;
};

/** Wraps a value in quotes when it would otherwise tokenize as two terms. */
export const quoteChatValue = (value: string) =>
  /\s/.test(value) ? `"${value}"` : value;

/** Renders a filter back into the text the parser would read it from. */
export const formatChatFilter = (filter: ChatQueryFilter) =>
  `${filter.key}:${quoteChatValue(filter.value)}`;

/** Whether a parsed query would narrow anything down at all. */
export const isEmptyChatQuery = (q: ParsedChatQuery) =>
  q.terms.length === 0 &&
  q.from.length === 0 &&
  q.roles.length === 0 &&
  q.before === undefined &&
  q.after === undefined &&
  q.actions.length === 0 &&
  q.admin.length === 0 &&
  !q.adminAny;
