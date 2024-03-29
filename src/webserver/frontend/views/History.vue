<style lang="scss" scoped>
@import '../css/style';

.history-container {
  display: flex;
  align-items: stretch;
}

.chat-history {
  @include column-container;
}

@media screen and (max-width: 600px) {
}

.chat-new-day {
  @include center;
  color: white;
  height: 32px;
  font-size: 24px;
  text-shadow: none;
  font-weight: bold;
  text-align: center;
  background-color: $br-bg-header;
  margin-bottom: 8px;
  margin-right: 8px;
  top: 0;
  position: sticky;
  text-transform: uppercase;
}

.calendar-container {
  @include column;
  margin-right: 8px;
  z-index: 100;
  min-height: 32px;
  align-items: flex-end;
}

.calendar {
  background-color: $br-element-footer-bg;
  min-width: 200px;

  .year,
  .month {
    @include center;
    background-color: $br-bg-header;
    justify-content: space-between;
    padding: 0 8px;
    padding-bottom: 8px;
  }

  .year {
    padding-top: 8px;
  }

  .calendar-days {
    font-size: 24px;
    display: grid;
    grid-template-columns: repeat(7, 40px);
    grid-auto-rows: 40px;
    text-align: center;

    .days {
      @include center;
      color: $br-boring-button-fg;

      &.header {
        background-color: $br-bg-header;
      }

      &.available {
        color: white;
        background-color: $br-button-normal;
        border-radius: 0;
        cursor: pointer;

        &:hover {
          background-color: $br-element-hover;
        }
        &:active {
          background-color: $br-element-pressed;
        }
        &.today:hover {
          background-color: $br-info-hover;
        }
        &.today:active {
          background-color: $br-info-pressed;
        }
      }

      &.today {
        color: white;
        border: 2px solid $br-info-normal;
      }

      &:not(.today):not(.available) {
        pointer-events: none;
      }
    }
  }
}
</style>

<template>
  <page>
    <nav-header title="History">
      <div class="calendar-container">
        <br-button
          normal
          boxy
          style="margin-right: 0"
          data-tooltip="Show a calendar previewing days"
          @click="showCalendar = !showCalendar"
        >
          <CalendarIcon />
          Calendar
        </br-button>
        <div class="calendar" v-if="showCalendar">
          <div class="year">
            <br-button
              icon
              normal
              :disabled="!getPrevYear()"
              @click="setDate(getPrevYear())"
            >
              <ArrowLeftIcon />
            </br-button>
            {{ year }}
            <br-button
              icon
              normal
              :disabled="!getNextYear()"
              @click="setDate(getNextYear())"
            >
              <ArrowRightIcon />
            </br-button>
          </div>
          <div class="month">
            <br-button
              icon
              normal
              :disabled="!hasPrevMonth"
              @click="setDate(getPrevMonth())"
            >
              <ArrowLeftIcon />
            </br-button>
            {{ MONTHS[month] }}
            <br-button
              icon
              normal
              :disabled="!hasNextMonth"
              @click="setDate(getNextMonth())"
            >
              <ArrowRightIcon />
            </br-button>
          </div>
          <div class="calendar-days">
            <div class="header days">S</div>
            <div class="header days">M</div>
            <div class="header days">T</div>
            <div class="header days">W</div>
            <div class="header days">T</div>
            <div class="header days">F</div>
            <div class="header days">S</div>
            <div v-for="d in startDay" :key="'empty' + d"></div>
            <div
              v-for="d in numDays"
              :key="d"
              :class="{
                days: true,
                today: nowMonth === month && nowYear === year && nowDay === d,
                available:
                  !(nowMonth === month && nowYear === year && d > nowDay) &&
                  calendar[year] &&
                  calendar[year][month] &&
                  calendar[year][month][d],
              }"
              @click="focusDay(year, month, d)"
            >
              {{ d }}
            </div>
          </div>
        </div>
      </div>
    </nav-header>
    <page-content>
      <side-nav :active="$route.name" />
      <div class="generic-container history-container">
        <div class="chat-history">
          <div class="scroll-container">
            <v-infinite-scroll
              :loading="loading"
              @top="prevPage"
              @bottom="nextPage"
              @scroll="ev => logDir(ev)"
              :on-top-scrolls-to-bottom="false"
              :offset="offset"
              class="scroll-scroller"
            >
              <template v-for="log in chats">
                <div
                  v-if="log.newDay"
                  class="chat-new-day"
                  :key="log._id + 'day'"
                >
                  {{ log.newDay }}
                </div>
                <br-chat-entry :log="log" :key="log._id" />
              </template>
            </v-infinite-scroll>
          </div>
          <br-loader :active="loading && firstLoad" size="huge"
            >Loading Chat</br-loader
          >
        </div>
      </div>
    </page-content>
  </page>
</template>

<script>
import CalendarIcon from 'vue-tabler-icons/icons/CalendarIcon';
import ArrowLeftIcon from 'vue-tabler-icons/icons/ArrowLeftIcon';
import ArrowRightIcon from 'vue-tabler-icons/icons/ArrowRightIcon';

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

const sorted = (obj, reverse = false) =>
  Object.keys(obj)
    .map(Number)
    .sort((a, b) => (reverse ? b - a : a - b));

export default {
  components: { CalendarIcon, ArrowLeftIcon, ArrowRightIcon },
  async created() {
    await this.getCalendar();
    const paramTime = this.$route.params.time;
    const time =
      paramTime &&
      new Date(paramTime.match(/^\d+$/) ? Number(paramTime) : paramTime);
    // valid time passed into route param
    if (time && time.getTime() === time.getTime()) {
      await this.getChats({ before: time.getTime() - 1 });
      await this.getChats({ after: time.getTime() - 1 });
      this.focused = time.getTime();
      const focused = this.$el.querySelector('.focused');
      focused.scrollIntoView({ block: 'center' });
    } else {
      await this.getChats({ before: Date.now() });
      this.scroll();
    }
  },
  beforeDestroy() {},
  destroyed() {},
  mounted() {},
  methods: {
    // get the chat calendar (days messages have been sent)
    async getCalendar() {
      this.loading = true;
      this.calendar = await this.$$request('chat.calendar');
      this.loading = false;
    },
    scroll() {
      return new Promise(resolve => {
        const container = this.$el.querySelector('.scroll-scroller');
        window.requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
          resolve();
        });
      });
    },
    async focusDay(year, month, day) {
      if (this.loading) return false;
      this.chats = [];
      const time = new Date(year, month, day).getTime();
      await this.getChats({ after: time });
    },

    handleChats(chats, { before: _b, after: _a }, _dir) {
      if (!chats.length) return;

      // add new chats and sort by create time
      this.chats = this.chats.concat(chats);
      this.chats.sort((a, b) => a.created - b.created);

      // find the min and max times for message creation
      const min = this.chats[0].created;
      const max = this.chats[this.chats.length - 1].created;

      for (let i = 0; i < this.chats.length; i++) {
        const c = this.chats[i];
        const date = new Date(c.created);
        c.date = date.getDate();

        // determine if the date between chat messages is a different day and insert that date
        if (i === 0 || c.date !== this.chats[i - 1].date) {
          c.newDay = `${MONTHS[date.getMonth()]} ${
            c.date
          }, ${date.getFullYear()}`;
        } else {
          c.newDay = undefined;
        }
      }

      this.min = min;
      this.max = max;
    },

    async prevPage() {
      // check if this is absolute min pages (no results)
      if (this.absMin && this.min <= this.absMin) return;
      const chats = await this.getChats({ before: this.min }, 'top');
      if (chats.length === 0) {
        this.absMin = this.min;
      }
    },

    async nextPage() {
      // check if this is absolute max pages (no results)
      if (this.absMax && this.max >= this.absMax) return;
      const chats = await this.getChats({ after: this.max }, 'bottom');
      if (chats.length === 0) this.absMax = this.max;
    },

    async getChats({ before, after }, dir) {
      this.loading = true;
      const chats = await this.$$request('chat.history', { before, after });
      this.handleChats(chats, { before, after }, dir);

      // remove chats that our off screen
      requestAnimationFrame(() => {
        if (dir === 'bottom' && this.chats.length > 200)
          this.chats.splice(0, this.chats.length - 200).map(m => m.message);

        if (dir === 'top' && this.chats.length > 200)
          this.chats.splice(200, this.chats.length - 200).map(m => m.message);
      });

      this.loading = false;
      this.firstLoad = false;
      return chats;
    },

    // find the next selectable year
    getNextYear() {
      const year = sorted(this.calendar).find(y => y > this.year);
      if (!year) return;
      return [year, sorted(this.calendar[year])[0]];
    },

    // find the previous selectable year
    getPrevYear() {
      const year = sorted(this.calendar, true).find(y => y < this.year);
      if (!year) return;
      return [year, sorted(this.calendar[year], true)[0]];
    },

    // set the selected month and year
    setDate([year, month]) {
      this.month = month;
      this.year = year;
    },

    // find the next selectable month
    getNextMonth() {
      // if this isn't the last month and there are things for this year
      if (this.month !== 11 && this.calendar[this.year]) {
        // find the first month from this year greater than this month
        const month = sorted(this.calendar[this.year]).find(
          m => m > this.month
        );
        if (typeof month == 'number') return [this.year, month];
      }

      // find the next largest year
      const year = sorted(this.calendar).find(y => y > this.year);
      if (!year) return;

      // find the first month
      const month = sorted(this.calendar[year])[0];
      if (typeof month !== 'number') return;
      return [year, month];
    },

    // find the previous selectable month
    getPrevMonth() {
      // if this isn't the first month and there are things for this year
      if (this.month !== 0 && this.calendar[this.year]) {
        // find the first month from this year greater than this month
        const month = sorted(this.calendar[this.year], true).find(
          m => m < this.month
        );
        if (typeof month == 'number') return [this.year, month];
      }

      // find the next smallest year
      const year = sorted(this.calendar, true).find(y => y < this.year);
      if (!year) return;

      // find the last month
      const month = sorted(this.calendar[year], true)[0];
      if (typeof month !== 'number') return;
      return [year, month];
    },
  },
  sockets: {},
  computed: {
    numDays() {
      return new Date(this.year, this.month + 1, 0).getDate();
    },
    startDay() {
      return new Date(this.year, this.month, 1).getDay();
    },
    hasNextMonth() {
      return !!this.getNextMonth();
    },
    hasPrevMonth() {
      return !!this.getPrevMonth();
    },
  },
  data() {
    const date = new Date();
    const month = date.getMonth();
    const year = date.getFullYear();
    const day = date.getDate();
    return {
      MONTHS,

      // how close to the edge the user has to scroll before loading new messages
      offset: 500,

      date,
      month,
      year,
      day,
      nowYear: year,
      nowMonth: month,
      nowDay: day,

      loading: true,
      showCalendar: false,
      firstLoad: true,
      calendar: {},
      chats: [],
    };
  },
};
</script>
