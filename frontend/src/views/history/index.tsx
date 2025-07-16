import {
  Button,
  ChatEntry,
  InfiniteScroll,
  Loader,
  NavHeader,
  PageContent,
  SideNav,
} from '@components';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
} from '@tabler/icons-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { rpcReq } from '../../socket';
import { useRoute } from 'wouter';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const sorted = (obj: Record<number, any>, reverse = false) =>
  Object.keys(obj)
    .map(Number)
    .sort((a, b) => (reverse ? b - a : a - b));

export const HistoryView = () => {
  const [_, params] = useRoute('/history/:time?');
  const paramTime = params?.time;

  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendar, setCalendar] = useState<
    Record<number, Record<number, Record<number, boolean>>>
  >({});
  const [chats, setChats] = useState<any[]>([]);

  const nowYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState(nowYear);
  const nowMonth = useMemo(() => new Date().getMonth(), []);
  const [month, setMonth] = useState(nowMonth);
  const nowDay = useMemo(() => new Date().getDate(), []);
  const ref = useRef<HTMLDivElement>(null);

  const [absMin, setAbsMin] = useState<number | null>(null);
  const [absMax, setAbsMax] = useState<number | null>(null);
  const minRef = useRef<number | null>(null);
  const maxRef = useRef<number | null>(null);
  const chatsRef = useRef<any[]>([]);

  const getCalendar = useCallback(async () => {
    setLoading(true);
    const calendarData = await rpcReq('chat.calendar');
    setCalendar(calendarData);
    setLoading(false);
  }, []);

  const handleChats = useCallback((chats: any[]) => {
    if (!chats.length) return;

    // add new chats and sort by create time
    chatsRef.current = chatsRef.current.concat(chats);
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
        c.newDay = `${MONTHS[date.getMonth()]} ${
          c.date
        }, ${date.getFullYear()}`;
      } else {
        c.newDay = undefined;
      }
    }

    minRef.current = min;
    maxRef.current = max;
  }, []);

  const getChats = useCallback(
    async (
      { before, after }: { before?: number; after?: number },
      dir?: 'top' | 'bottom'
    ) => {
      setLoading(true);
      const chatData = await rpcReq('chat.history', { before, after });
      handleChats(chats);

      // remove chats that our off screen
      if (dir === 'bottom' && chatsRef.current.length > 200) {
        chatsRef.current.splice(0, chatsRef.current.length - 200);
      }
      if (dir === 'top' && chatsRef.current.length > 200) {
        chatsRef.current.splice(0, chatsRef.current.length - 200);
      }

      setFirstLoad(false);
      setLoading(false);
      return chatData;
    },
    []
  );

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
      if (firstLoad) await getCalendar();

      // ensures time is not nan
      if (time && !Number.isNaN(time.getTime())) {
        await getChats({ before: time.getTime() - 1 });
        await getChats({ after: time.getTime() - 1 });
        requestAnimationFrame(() => {
          const el = ref.current?.querySelector('.focused');
          el?.scrollIntoView({ block: 'center' });
        });
      } else {
        await getChats({ before: Date.now() });
        scroll();
      }
    })();
  }, [paramTime]);

  const focusDay = async (year: number, month: number, day: number) => {
    if (loading) return;
    setChats([]);
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

  const setDate = (date: [number, number] | null) => {
    if (!date) return;
    setYear(year);
    setMonth(month);
  };

  const numDays = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  return (
    <>
      <NavHeader title="History">
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
          {showCalendar && (
            <div className="calendar">
              <div className="year">
                <Button
                  icon
                  normal
                  disabled={!prevYear}
                  onClick={() => setDate(prevYear)}
                >
                  <IconArrowLeft />
                </Button>
                {year}
                <Button
                  icon
                  normal
                  disabled={!nextYear}
                  onClick={() => setDate(nextYear)}
                >
                  <IconArrowRight />
                </Button>
              </div>
              <div className="month">
                <Button
                  icon
                  normal
                  disabled={!prevMonth}
                  onClick={() => setDate(prevMonth)}
                >
                  <IconArrowLeft />
                </Button>
                {MONTHS[month]}
                <Button
                  icon
                  normal
                  disabled={!nextMonth}
                  onClick={() => setDate(nextMonth)}
                >
                  <IconArrowRight />
                </Button>
              </div>
              <div className="calendar-days">
                <div className="header days">S</div>
                <div className="header days">M</div>
                <div className="header days">T</div>
                <div className="header days">W</div>
                <div className="header days">T</div>
                <div className="header days">F</div>
                <div className="header days">S</div>
                {Array.from({ length: startDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({
                  length: numDays,
                }).map((_, d) => (
                  <div
                    key={d}
                    className={`days ${
                      nowMonth === month && nowYear === year && d === nowDay
                        ? 'today'
                        : ''
                    } ${
                      !(nowMonth === month && nowYear === year && d > nowDay) &&
                      calendar[year]?.[month]?.[d]
                        ? 'available'
                        : ''
                    }`}
                    onClick={() => focusDay(year, month, d)}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container history-container" ref={ref}>
          <div className="chat-history">
            <div className="scroll-container">
              <InfiniteScroll
                loading={loading}
                onTop={prevPage}
                onBottom={nextPage}
                onTopScrollsToBottom={false}
                offset={500}
                className="scroller-scroll"
              >
                {chats.map(chat => (
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
          </div>
        </div>
      </PageContent>
    </>
  );
};
