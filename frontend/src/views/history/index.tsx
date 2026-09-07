import { isEmptyChatQuery, parseChatQuery } from '@backend/chatQuery';
import {
  addContext,
  addMatches,
  emptyTimeline,
  timelineItems,
} from '@backend/chatTimeline';
import {
  Button,
  Calendar,
  ChatEntry,
  InfiniteScroll,
  type InfiniteScrollHandle,
  Loader,
  MONTHS,
  NavBar,
  NavHeader,
  PageContent,
  SideNav,
} from '@components';
import { useHasScope, useRequireScope } from '@hooks';
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconSortAscending,
  IconSortDescending,
} from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRoute, useSearchParams } from 'wouter';
import { Permissions } from '../../permissions';
import { trpc, type RouterOutputs } from '../../trpc';
import { SearchBar } from './SearchBar';

type ChatHistoryItem = RouterOutputs['chat']['history'][number];
type ChatSearchResult = RouterOutputs['chat']['search'];
// how many entries a single click on an expander reveals
const CONTEXT_STEP = 5;

const dayLabel = (time: number) => {
  const date = new Date(time);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const sorted = (obj: Record<number, any>, reverse = false) =>
  Object.keys(obj)
    .map(Number)
    .sort((a, b) => (reverse ? b - a : a - b));

export const HistoryView = () => {
  const canAccess = useRequireScope(Permissions.ChatHistory);
  const canCalendar = useHasScope(Permissions.ChatCalendar);
  const [_, params] = useRoute('/history/:time?');
  const paramTime = params?.time;

  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendar, setCalendar] = useState<
    Record<number, Record<number, Record<number, boolean>>>
  >({});
  const [_historyKey, setHistoryKey] = useState(0);

  const nowYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState(nowYear);
  const nowMonth = useMemo(() => new Date().getMonth(), []);
  const [month, setMonth] = useState(nowMonth);
  const ref = useRef<HTMLDivElement>(null);

  const [absMin, setAbsMin] = useState<number | null>(null);
  const [absMax, setAbsMax] = useState<number | null>(null);
  const minRef = useRef<number | null>(null);
  const maxRef = useRef<number | null>(null);
  const chatsRef = useRef<ChatHistoryItem[]>([]);
  const trimHeightBefore = useRef<number | null>(null);
  const scroller = useRef<InfiniteScrollHandle>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = (searchParams.get('q') ?? '').trim();
  // a half-typed filter such as `from:` narrows nothing, so it should leave the
  // history on screen rather than flipping to an empty result list
  const isSearching =
    activeQuery.length > 0 && !isEmptyChatQuery(parseChatQuery(activeQuery));
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  // kept apart from the sort: the sort decides which entries you get, this
  // only decides where they sit
  const [order, setOrder] = useState<'newest-last' | 'newest-first'>(
    'newest-last',
  );
  const newestFirstRef = useRef(false);
  newestFirstRef.current = order === 'newest-first';
  const [results, setResults] = useState<ChatSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [timeline, setTimeline] = useState(emptyTimeline<ChatHistoryItem>());

  const utils = trpc.useUtils();

  const getCalendar = useCallback(async () => {
    setLoading(true);
    const calendarData = await utils.chat.calendar.fetch();
    setCalendar(calendarData);
    setLoading(false);
  }, []);

  const handleChats = useCallback((chats: ChatHistoryItem[]) => {
    if (!chats.length) return;

    // a duplicate would collide react keys and shuffle the rendered rows
    const seen = new Set(chatsRef.current.map(c => c._id));
    chatsRef.current = chatsRef.current.concat(
      chats.filter(c => !seen.has(c._id)),
    );
    chatsRef.current.sort((a, b) => a.created - b.created);

    // find the min and max times for message creation
    const min = chatsRef.current[0].created;
    const max = chatsRef.current[chatsRef.current.length - 1].created;

    minRef.current = min;
    maxRef.current = max;
    setHistoryKey(prev => prev + 1);
  }, []);

  const getChats = useCallback(
    async (
      { before, after }: { before?: number; after?: number },
      dir?: 'top' | 'bottom',
    ) => {
      setLoading(true);
      const chatData = await utils.chat.history.fetch({
        before,
        after,
      });
      handleChats(chatData);

      setFirstLoad(false);
      setLoading(false);

      // Defer trimming to a separate frame so InfiniteScroll's useLayoutEffect
      // sees the correct scrollHeight delta (prepend only, no truncation).
      // Reset the absolute boundary for the truncated end so infinite scroll
      // can re-fetch that direction.
      const trimDir = dir;
      if (trimDir && chatsRef.current.length > 200) {
        requestAnimationFrame(() => {
          const container = ref.current?.querySelector('.scroll-scroller');
          const heightBefore = container?.scrollHeight ?? 0;
          // trimming always drops the end furthest from what was just loaded,
          // which is above the reader in one arrangement and below in the
          // other
          const droppedAbove = newestFirstRef.current
            ? trimDir === 'top'
            : trimDir === 'bottom';

          if (trimDir === 'bottom') {
            chatsRef.current.splice(0, chatsRef.current.length - 200);
            minRef.current = chatsRef.current[0].created;
            setAbsMin(null);
          } else if (trimDir === 'top') {
            chatsRef.current.splice(200, chatsRef.current.length - 200);
            maxRef.current =
              chatsRef.current[chatsRef.current.length - 1].created;
            setAbsMax(null);
          }
          // rows removed above the viewport pull everything up under the
          // reader; correcting a frame later than the commit is a visible jump
          if (droppedAbove) trimHeightBefore.current = heightBefore;
          setHistoryKey(prev => prev + 1);
        });
      }

      return chatData;
    },
    [],
  );

  // names for the senders the last search resolved, so a linked query whose
  // from: holds an id still shows that player's name in the badge
  const senderNames = useMemo(
    () =>
      Object.fromEntries(
        (results?.senders ?? []).map(sender => [sender.id, sender.name]),
      ),
    [results?.senders],
  );

  const commitSearch = useCallback(
    (query: string) => {
      const next = new URLSearchParams(searchParams);
      if (query.trim()) next.set('q', query);
      else next.delete('q');
      if (next.toString() !== searchParams.toString())
        setSearchParams(next, { replace: true });
    },
    [searchParams],
  );

  // typing updates the url rather than firing a request, so a search is
  // linkable and the back button steps through searches
  useEffect(() => {
    const timer = setTimeout(() => commitSearch(searchInput), 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const runSearch = useCallback(
    async (cursor?: number) => {
      setSearching(true);
      const page = await utils.chat.search.fetch({
        query: activeQuery,
        sort,
        ...(cursor === undefined ? {} : { cursor }),
      });
      setResults(prev =>
        cursor === undefined || !prev
          ? page
          : { ...page, chats: [...prev.chats, ...page.chats] },
      );
      const merged = page.chats.map(chat => ({
        match: chat,
        before: page.context[chat._id]?.before ?? [],
        after: page.context[chat._id]?.after ?? [],
      }));
      setTimeline(prev =>
        addMatches(cursor === undefined ? emptyTimeline() : prev, merged),
      );
      setSearching(false);
    },
    [activeQuery, sort],
  );

  const firstSort = useRef(true);
  useEffect(() => {
    if (firstSort.current) {
      firstSort.current = false;
      return;
    }
    if (!isSearching) scrollToNewest();
  }, [order]);

  useEffect(() => {
    setTimeline(emptyTimeline());
    if (!isSearching) {
      setResults(null);
      return;
    }
    runSearch();
  }, [activeQuery, sort]);

  const expandGap = async (id: string, direction: 'before' | 'after') => {
    const rows = await utils.chat.context.fetch({
      id: Number(id),
      direction,
      count: CONTEXT_STEP,
    });
    setTimeline(prev => addContext(prev, id, direction, rows, CONTEXT_STEP));
  };

  const moreResults = () => {
    if (searching || !results?.hasMore || results.chats.length === 0) return;
    runSearch(results.chats[results.chats.length - 1].created);
  };

  const newestFirst = order === 'newest-first';

  useLayoutEffect(() => {
    const heightBefore = trimHeightBefore.current;
    if (heightBefore === null) return;
    trimHeightBefore.current = null;
    scroller.current?.keepPlaceAfterHeightChange(heightBefore);
  }, [_historyKey]);
  // stored oldest first however it is shown, so the sort only flips the view
  const historyEntries = newestFirst
    ? [...chatsRef.current].reverse()
    : chatsRef.current;

  /**
   * Put the newest end of the log in view: the bottom when the oldest is shown
   * first, the top when it is not.
   *
   * Holds it there rather than placing it once, because the rows keep growing
   * after they mount: the fonts have no `font-display`, so text reflows when
   * they land, and the height sits still right up until it does. Gives up as
   * soon as the reader scrolls.
   */
  const scrollToNewest = () =>
    new Promise<void>(resolve => {
      const container = ref.current?.querySelector('.scroll-scroller');
      if (!container) return resolve();

      let placed = -1;
      // only the reader taking over cancels this. a hold running out does not,
      // or the font pass below would be skipped on exactly the slow loads it
      // exists for
      let abandoned = false;

      const hold = (ms: number, done?: () => void) => {
        const until = performance.now() + ms;
        const pin = () => {
          if (abandoned) return done?.();
          // anywhere other than where this last put it means the reader moved
          if (placed >= 0 && container.scrollTop !== placed) {
            abandoned = true;
            return done?.();
          }

          container.scrollTop = newestFirst ? 0 : container.scrollHeight;
          // read back, because the browser clamps to what is really scrollable
          placed = container.scrollTop;

          if (performance.now() >= until) return done?.();
          requestAnimationFrame(pin);
        };
        requestAnimationFrame(pin);
      };

      hold(600, resolve);
      // a hard refresh downloads the fonts again, which takes longer than the
      // hold above and reflows every row once it lands
      document.fonts?.ready.then(() => hold(300));
    });

  useEffect(() => {
    const time =
      paramTime &&
      new Date(paramTime.match(/^\d+$/) ? Number(paramTime) : paramTime);
    (async () => {
      if (firstLoad && canCalendar) await getCalendar();

      // results replace the history list, so there is nothing to load behind them
      if (isSearching) return;

      // ensures time is not nan
      if (time && !Number.isNaN(time.getTime())) {
        chatsRef.current = [];
        await getChats({ before: time.getTime() - 1 });
        await getChats({ after: time.getTime() - 1 });
        requestAnimationFrame(() => {
          const el = ref.current?.querySelector('.focused');
          el?.scrollIntoView({ block: 'center' });
        });
      } else {
        chatsRef.current = [];
        await getChats({ before: Date.now() });
        scrollToNewest();
      }
    })();
  }, [paramTime, isSearching]);

  const focusDay = async (year: number, month: number, day: number) => {
    chatsRef.current = [];
    setHistoryKey(prev => prev + 1);
    const time = new Date(year, month, day).getTime();
    await getChats({ after: time });
  };

  // a second call before the first has moved the cursor would ask for the page
  // already being fetched, and the rows it returns are all discarded as
  // duplicates, which reads downstream as the log having no more to give
  const pageInFlight = useRef(false);

  // without a cursor the server falls back to the newest page, which would
  // fetch what is already on screen a second time and duplicate every row
  const prevPage = async () => {
    if (pageInFlight.current || minRef.current === null) return;
    if (absMin && minRef.current <= absMin) return;
    pageInFlight.current = true;
    try {
      const chats = await getChats({ before: minRef.current }, 'top');
      if (chats.length === 0) setAbsMin(minRef.current);
    } finally {
      pageInFlight.current = false;
    }
  };

  const nextPage = async () => {
    if (pageInFlight.current || maxRef.current === null) return;
    if (absMax && maxRef.current >= absMax) return;
    pageInFlight.current = true;
    try {
      const chats = await getChats({ after: maxRef.current }, 'bottom');
      if (chats.length === 0) setAbsMax(maxRef.current);
    } finally {
      pageInFlight.current = false;
    }
  };
  const sortedCalendar = useMemo(() => sorted(calendar), [calendar]);
  const invSortedCalendar = useMemo(() => sorted(calendar, true), [calendar]);

  const nextYear = useMemo(() => {
    const found = invSortedCalendar.find(y => y > year) ?? null;
    if (!found) return null;
    return [found, sorted(calendar[found])[0]] as [number, number];
  }, [calendar, invSortedCalendar]);

  const prevYear = useMemo(() => {
    const found = sortedCalendar.find(y => y < year) ?? null;
    if (!found) return null;
    return [found, sorted(calendar[found], true)[0]] as [number, number];
  }, [calendar, sortedCalendar]);

  // find the next selectable month
  const nextMonth = useMemo(() => {
    // if this isn't the last month and there are things for this year
    if (month !== 11 && calendar[year]) {
      // find the first month from this year greater than this month
      const foundMonth = sorted(calendar[year]).find(m => m > month);
      if (typeof foundMonth == 'number')
        return [year, foundMonth] as [number, number];
    }

    // find the next largest year
    const foundYear = sortedCalendar.find(y => y > year);
    if (!foundYear) return null;

    // find the first month
    const foundMonth = sorted(calendar[foundYear])[0];
    if (typeof foundMonth !== 'number') return null;
    return [foundYear, foundMonth] as [number, number];
  }, [year, month, sortedCalendar, calendar]);

  // find the previous selectable month
  const prevMonth = useMemo(() => {
    // if this isn't the first month and there are things for this year
    if (month !== 0 && calendar[year]) {
      // find the first month from this year greater than this month
      const foundMonth = sorted(calendar[year], true).find(m => m < month);
      if (typeof foundMonth == 'number')
        return [year, foundMonth] as [number, number];
    }

    // find the next smallest year
    const foundYear = invSortedCalendar.find(y => y < year);
    if (!foundYear) return null;

    // find the last month
    const foundMonth = sorted(calendar[foundYear], true)[0];
    if (typeof foundMonth !== 'number') return null;
    return [foundYear, foundMonth] as [number, number];
  }, [year, month, calendar]);

  // the nav memos hand back the target as [year, month]
  const setDate = (date: [number, number] | null) => {
    if (!date) return;
    setYear(date[0]);
    setMonth(date[1]);
  };

  if (!canAccess) return null;

  return (
    <>
      <NavHeader title="History">
        <Button
          normal
          boxy
          data-tooltip={
            sort === 'newest'
              ? 'Searching newest results first'
              : 'Searching oldest results first'
          }
          onClick={() => setSort(s => (s === 'newest' ? 'oldest' : 'newest'))}
        >
          {sort === 'newest' ? <IconSortDescending /> : <IconSortAscending />}{' '}
          Sort
        </Button>
        <Button
          normal
          boxy
          data-tooltip={
            order === 'newest-first'
              ? 'Newest messages at the top'
              : 'Newest messages at the bottom'
          }
          onClick={() =>
            setOrder(o =>
              o === 'newest-first' ? 'newest-last' : 'newest-first',
            )
          }
        >
          {order === 'newest-first' ? <IconArrowUp /> : <IconArrowDown />} Order
        </Button>
        {canCalendar && (
          <div className="calendar-container">
            <Button
              normal
              boxy
              style={{ marginRight: 0 }}
              data-tooltip="Show a calendar previewing days"
              onClick={() => setShowCalendar(!showCalendar)}
            >
              <IconCalendar /> Calendar
            </Button>
            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Calendar
                    {...{
                      prevYear,
                      setDate,
                      year,
                      nextYear,
                      prevMonth,
                      month,
                      nextMonth,
                    }}
                    available={calendar}
                    onPick={focusDay}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container history-container" ref={ref}>
          <div className="chat-history">
            <NavBar
              attached={isSearching && !!results}
              className="chat-search-bar"
            >
              <SearchBar
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={commitSearch}
                onClear={() => {
                  setSearchInput('');
                  commitSearch('');
                }}
                senderNames={senderNames}
              />
            </NavBar>
            {isSearching ? (
              <>
                {results && (
                  <NavBar className="chat-search-summary">
                    <span>
                      {results.total}
                      {results.totalCapped ? '+' : ''} result
                      {results.total === 1 ? '' : 's'}
                    </span>
                    {results.senders.map(sender => (
                      <span className="chat-search-chip" key={sender.id}>
                        from: {sender.name}
                      </span>
                    ))}
                    {results.filters
                      .filter(f => f.key !== 'from')
                      .map(filter => (
                        <span
                          className="chat-search-chip"
                          key={filter.key + filter.value}
                        >
                          {filter.key}:{' '}
                          {filter.value ||
                            (filter.key === 'admin' ? 'any' : '')}
                        </span>
                      ))}
                  </NavBar>
                )}
                <div className="scroll-container">
                  <InfiniteScroll
                    loading={searching}
                    onBottom={moreResults}
                    // results page downward only, and reaching the top must
                    // not throw the reader to the bottom
                    onTop={() => {}}
                    onTopScrollsToBottom={false}
                    offset={500}
                    className="scroll-scroller"
                  >
                    {timelineItems(timeline, newestFirst).map(
                      (item, index, all) => {
                        if (item.kind === 'gap')
                          return (
                            <div
                              key={`gap:${item.direction}:${item.id}`}
                              className="chat-search-expand"
                              data-tooltip={
                                item.direction === 'before'
                                  ? 'Show earlier messages'
                                  : 'Show later messages'
                              }
                              onClick={() => expandGap(item.id, item.direction)}
                            >
                              {sort === 'newest' ? (
                                item.direction === 'before' ? (
                                  <IconChevronDown />
                                ) : (
                                  <IconChevronUp />
                                )
                              ) : item.direction === 'before' ? (
                                <IconChevronUp />
                              ) : (
                                <IconChevronDown />
                              )}
                            </div>
                          );

                        const day = dayLabel(item.entry.created);
                        const previous = all
                          .slice(0, index)
                          .reverse()
                          .find(i => i.kind === 'entry');
                        return (
                          <React.Fragment key={item.id}>
                            {(!previous ||
                              day !== dayLabel(previous.entry.created)) && (
                              <div className="chat-new-day">{day}</div>
                            )}
                            <ChatEntry log={item.entry} dim={!item.isMatch} />
                          </React.Fragment>
                        );
                      },
                    )}
                    {results && results.chats.length === 0 && !searching && (
                      <div className="chat-search-empty">
                        No messages match this search
                      </div>
                    )}
                  </InfiniteScroll>
                </div>
                <Loader active={searching && !results} size="huge">
                  Searching
                </Loader>
              </>
            ) : (
              <>
                <div className="scroll-container">
                  <InfiniteScroll
                    ref={scroller}
                    loading={loading}
                    // newest first puts the newer end at the top, so the two
                    // ends of the log swap which way they are paged from
                    onTop={newestFirst ? nextPage : prevPage}
                    onBottom={newestFirst ? prevPage : nextPage}
                    onTopScrollsToBottom={false}
                    offset={500}
                    className="scroll-scroller"
                  >
                    {historyEntries.map((chat, index, all) => {
                      const day = dayLabel(chat.created);
                      const previous = all[index - 1];
                      return (
                        <React.Fragment key={chat._id}>
                          {(!previous ||
                            day !== dayLabel(previous.created)) && (
                            <div className="chat-new-day">{day}</div>
                          )}
                          <ChatEntry log={chat} />
                        </React.Fragment>
                      );
                    })}
                  </InfiniteScroll>
                </div>
                <Loader active={loading && firstLoad} size="huge">
                  Loading Chat
                </Loader>
              </>
            )}
          </div>
        </div>
      </PageContent>
    </>
  );
};
