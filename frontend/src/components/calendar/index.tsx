import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { Button } from '../button';

export const MONTHS = [
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

/** Days a month has, and the weekday its first day falls on. */
export const monthShape = (year: number, month: number) => ({
  numDays: new Date(year, month + 1, 0).getDate(),
  startDay: new Date(year, month, 1).getDay(),
});

export const Calendar = ({
  prevYear,
  nextYear,
  prevMonth,
  nextMonth,
  setDate,
  year,
  month,
  available,
  onPick,
}: {
  /** navigation targets as [year, month]; null greys the arrow out */
  prevYear: [number, number] | null;
  nextYear: [number, number] | null;
  prevMonth: [number, number] | null;
  nextMonth: [number, number] | null;
  setDate: (date: [number, number] | null) => void;
  year: number;
  month: number;
  /**
   * Days that can be picked, as year to month to day. Omit to allow any day up
   * to today, which is what a plain date picker wants; the history view passes
   * the days it actually has messages for.
   */
  available?: Record<number, Record<number, Record<number, boolean>>>;
  onPick: (year: number, month: number, day: number) => void;
}) => {
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();
  const { numDays, startDay } = monthShape(year, month);

  return (
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
        <div className="week-header days">S</div>
        <div className="week-header days">M</div>
        <div className="week-header days">T</div>
        <div className="week-header days">W</div>
        <div className="week-header days">T</div>
        <div className="week-header days">F</div>
        <div className="week-header days">S</div>
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: numDays }).map((_, d) => {
          const day = d + 1;
          const isToday =
            nowMonth === month && nowYear === year && day === nowDay;
          const isFuture =
            year > nowYear ||
            (year === nowYear &&
              (month > nowMonth || (month === nowMonth && day > nowDay)));
          // the backing calendar is keyed by day of month, which starts at 1
          const canPick =
            !isFuture && (available ? available[year]?.[month]?.[day] : true);

          return (
            <div
              key={d}
              className={`days ${isToday ? 'today' : ''} ${
                canPick ? 'available' : ''
              }`}
              onClick={() => onPick(year, month, day)}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
};
