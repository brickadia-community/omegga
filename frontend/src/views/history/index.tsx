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
  Loader,
  MONTHS,
  NavBar,
  NavHeader,
  PageContent,
  SideNav,
} from '@components';
import { useHasScope, useRequireScope } from '@hooks';
import {
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
type ChatHistoryEntry = ChatHistoryItem & {
  date: number;
  newDay?: string;
};

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
  const chatsRef = useRef<ChatHistoryEntry[]>([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = (searchParams.get('q') ?? '').trim();
  // a half-typed filter such as `from:` narrows nothing, so it should leave the
  // history on screen rather than flipping to an empty result list
  const isSearching =
    activeQuery.length > 0 && !isEmptyChatQuery(parseChatQuery(activeQuery));
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
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

    // add new chats and sort by create time
    chatsRef.current = chatsRef.current.concat(chats as ChatHistoryEntry[]);
    chatsRef.current.sort((a, b) => a.created - b.created);

    // find the min and max times for message creation
    const min = chatsRef.current[0].created;
    const max = chatsRef.current[chatsRef.current.length - 1].created;

    for (let i = 0; i < chatsRef.current.length; i++) {
      const c = chatsRef.current[i];
      const date = new Date(c.created);
      c.date = date.getDate();

      // determine if the date between chat messages is a different day and insert that date
      if (i === 0 || c.date !== chatsRef.current[i - 1].date) {
        c.newDay = dayLabel(c.created);
      } else {
        c.newDay = undefined;
      }
    }

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

  const scroll = () =>
    new Promise<void>(resolve => {
      const container = ref.current?.querySelector('.scroll-scroller');
      window.requestAnimationFrame(() => {
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        resolve();
      });
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
        scroll();
      }
    })();
  }, [paramTime, isSearching]);

  const focusDay = async (year: number, month: number, day: number) => {
    chatsRef.current = [];
    setHistoryKey(prev => prev + 1);
    const time = new Date(year, month, day).getTime();
    await getChats({ after: time });
  };

  const prevPage = async () => {
    // check if this is absolute min pages (no results)
    if (absMin && minRef.current && minRef.current <= absMin) return;
    const chats = await getChats({ before: minRef.current! }, 'top');
    if (chats.length === 0) setAbsMin(minRef.current);
  };

  const nextPage = async () => {
    // check if this is absolute max pages (no results)
    if (absMax && maxRef.current && maxRef.current >= absMax) return;
    const chats = await getChats({ after: maxRef.current! }, 'bottom');
    if (chats.length === 0) setAbsMax(maxRef.current);
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
        {isSearching && (
          <Button
            normal
            boxy
            data-tooltip={
              sort === 'newest'
                ? 'Newest results first'
                : 'Oldest results first'
            }
            onClick={() => setSort(s => (s === 'newest' ? 'oldest' : 'newest'))}
          >
            {sort === 'newest' ? <IconSortDescending /> : <IconSortAscending />}{' '}
            Sort
          </Button>
        )}
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
                    // results page downward only; there is nothing above the
                    // newest match to scroll back into
                    onTop={() => {}}
                    offset={500}
                    className="scroll-scroller"
                  >
                    {timelineItems(timeline, sort === 'newest').map(
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
                    loading={loading}
                    onTop={prevPage}
                    onBottom={nextPage}
                    onTopScrollsToBottom={false}
                    offset={500}
                    className="scroll-scroller"
                  >
                    {chatsRef.current.map(chat => (
                      <React.Fragment key={chat._id}>
                        {chat.newDay && (
                          <div className="chat-new-day">{chat.newDay}</div>
                        )}
                        <ChatEntry key={chat._id} log={chat} />
                      </React.Fragment>
                    ))}
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
