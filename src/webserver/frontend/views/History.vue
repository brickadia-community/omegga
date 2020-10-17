<style lang="scss" scoped>
@import '../css/style';

.history-container {
  display: flex;
  align-items: stretch;
}

.chat-history {
  position: relative;
  flex-direction: column;
  display: flex;
  flex: 1;
}

@media screen and (max-width: 600px) {

}

.log-entry {
  text-decoration: none;
}

.log-entry:hover .log-row {
  background: rgba(255, 255, 255, 0.2);
}

.log-entry.focused .log-row {
  background: $br-main-normal;
}

.log-row {
  display: flex;
}

.chat-new-day {
  display: flex;
  align-items: center;
  justify-content: center;
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
  margin-right: 8px;
  z-index: 100;
  min-height: 32px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.calendar-container .button {
  height: 32px;
}

.calendar {
  background-color: $br-element-footer-bg;
  min-width: 200px;
}


.calendar .year, .calendar .month {
  display: flex;
  align-items: center;
  background-color: $br-bg-header;
  justify-content: space-between;
  padding: 0 8px;
  padding-bottom: 8px;
}

.calendar .year {
  padding-top: 8px;
}

.calendar-days {
  font-size: 24px;
  display: grid;
  grid-template-columns: repeat(7, 40px);
  grid-auto-rows: 40px;
  text-align: center;
}

.calendar-days .days {
  display: flex;
  align-items: center;
  justify-content: center;
  color: $br-boring-button-fg;
}

.calendar-days .days.header {
  background-color: $br-bg-header;
}

.calendar-days .days.today {
  border-radius: 50%;
}

.calendar-days .days.available {
  color: white;
  background-color: $br-button-normal;
  border-radius: 0;
  cursor: pointer;
}

.calendar-days .days.today {
  color: white;
  background-color: $br-info-normal;
}

.calendar-days .days.available:hover { background-color: $br-element-hover; }
.calendar-days .days.available:active {background-color: $br-element-pressed; }
.calendar-days .days.available.today:hover { background-color: $br-info-hover; }
.calendar-days .days.available.today:active {background-color: $br-info-pressed; }

.calendar-days .days:not(.today):not(.available) {
  pointer-events: none;
}

</style>

<template>
  <page>
    <nav-header title="History">
      <div class="calendar-container">
        <br-button normal
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
            <br-button icon normal :disabled="!getPrevYear()" @click="setDate(getPrevYear())">
              <ArrowLeftIcon/>
            </br-button>
            {{year}}
            <br-button icon normal :disabled="!getNextYear()" @click="setDate(getNextYear())">
              <ArrowRightIcon/>
            </br-button>
          </div>
          <div class="month">
            <br-button icon normal :disabled="!hasPrevMonth" @click="setDate(getPrevMonth())">
              <ArrowLeftIcon/>
            </br-button>
            {{MONTHS[month]}}
            <br-button icon normal :disabled="!hasNextMonth" @click="setDate(getNextMonth())">
              <ArrowRightIcon/>
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
            <div v-for="d in numDays" :key="d" :class="{
              days: true,
              today: nowMonth === month && nowYear === year && nowDay === d,
              available: !(nowMonth === month && nowYear === year && d > nowDay) &&
                calendar[year] && calendar[year][month] && calendar[year][month][d],
            }" @click="focusDay(year, month, d)">
              {{d}}
            </div>
          </div>
        </div>
      </div>
    </nav-header>
    <page-content>
      <side-nav :active="$route.name"/>
      <div class="generic-container history-container">
        <div class="chat-history">
          <div class="scroll-container">
            <v-infinite-scroll
              :loading="loading"
              @top="prevPage"
              @bottom="nextPage"
              :on-top-scrolls-to-bottom="false"
              :offset="offset"
              class="scroll-scroller"
            >
              <template v-for="log in chats">
                <div v-if="log.newDay" class="chat-new-day" :key="log._id + 'day'">{{log.newDay}}</div>
                <router-link
                  :key="log._id"
                  :class="['log-entry', {focused: $route.params.time == log.created}]"
                  :to="'/history/' + log.created"
                >
                  <div class="log-row">
                    <chat-time :time="log.created"/>
                    <div v-if="log.action === 'msg'" class="chat-message">
                      {{log.user.web ? '[' : ''}}<span class="user" :style="{color: '#'+log.user.color}"
                      >{{log.user.name}}</span>{{log.user.web ? ']' : ''}}: {{log.message}}
                    </div>
                    <div v-if="log.action === 'leave'" class="join-message">
                      <span class="user">{{log.user.name}}</span> left the game.
                    </div>
                    <div v-if="log.action === 'join'" class="join-message">
                      <span class="user">{{log.user.name}}</span> joined the game{{log.user.isFirst ? ' for the first time' : ''}}.
                    </div>
                    <div v-if="log.action === 'server'" class="server-message">
                      {{log.message}}
                    </div>
                  </div>
                </router-link>
              </template>
            </v-infinite-scroll>
          </div>
          <br-loader :active="loading && firstLoad" size="huge">Loading Chat</br-loader>
        </div>
      </div>
    </page-content>
  </page>
</template>

<script>
import CalendarIcon from 'vue-tabler-icons/icons/CalendarIcon';
import ArrowLeftIcon from 'vue-tabler-icons/icons/ArrowLeftIcon';
import ArrowRightIcon from 'vue-tabler-icons/icons/ArrowRightIcon';
import BugIcon from 'vue-tabler-icons/icons/BugIcon';
import CircleCheckIcon from 'vue-tabler-icons/icons/CircleCheckIcon';
import RefreshAlertIcon from 'vue-tabler-icons/icons/RefreshAlertIcon';

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

const sorted = (obj, reverse=false) => Object.keys(obj).map(Number).sort((a, b) => reverse ? b - a : a - b);

export default {
  components: { CalendarIcon, ArrowLeftIcon, ArrowRightIcon, BugIcon, CircleCheckIcon, RefreshAlertIcon },
  async created() {
    await this.getCalendar();
    const paramTime = this.$route.params.time
    const time = paramTime && new Date(paramTime.match(/^\d+$/) ? Number(paramTime) : paramTime);
    // valid time passed into route param
    if (time && time.getTime() === time.getTime()) {
      await this.getChats({ before: time.getTime()-1 });
      await this.getChats({ after: time.getTime()-1 });
      this.focused = time.getTime();
      const focused = this.$el.querySelector('.focused');
      focused.scrollIntoView({block: 'center'});
    } else {
      await this.getChats({ before: Date.now() });
      this.scroll();
    }
  },
  beforeDestroy() {
  },
  destroyed () {
  },
  mounted() {
  },
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
      })
    },
    async focusDay(year, month, day) {
      if (this.loading) return false;
      this.chats = [];
      const time = new Date(year, month, day).getTime();
      await this.getChats({ after: time });
    },
    handleChats(chats, {before, after}) {
      if (!chats.length) return;
      this.chats = this.chats.concat(chats);
      this.chats.sort((a, b) => a.created - b.created);
      let min = this.chats[0].created;
      let max = this.chats[0].created;
      for (let i = 0; i < this.chats.length; i++) {
        const c = this.chats[i];
        min = Math.min(min, c.created);
        max = Math.max(max, c.created);
        const date = new Date(c.created);
        c.date = date.getDate();
        if (i === 0 || c.date !== this.chats[i-1].date) {
          c.newDay = `${MONTHS[date.getMonth()]} ${c.date}, ${date.getFullYear()}`;
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
      const chats = await this.getChats({ before: this.min });
      if (chats.length === 0) {
        this.absMin = this.min;
      }
    },

    async nextPage() {
      // check if this is absolute max pages (no results)
      if (this.absMax && this.max >= this.absMax) return;
      const chats = await this.getChats({ after: this.max });
      if (chats.length === 0) this.absMax = this.max;
    },

    async getChats({before, after}) {
      this.loading = true;
      const chats = await this.$$request('chat.history', {before, after});
      this.handleChats(chats, {before, after});
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
        const month = sorted(this.calendar[this.year])
          .find(m => m > this.month);
        if (typeof month == 'number')
          return [this.year, month];
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
        const month = sorted(this.calendar[this.year], true)
          .find(m => m < this.month);
        if (typeof month == 'number')
          return [this.year, month];
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
  sockets: {
  },
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
    hasPrevMonth() { return !!this.getPrevMonth(); },
  },
  data() {
    const date = new Date();
    const month = date.getMonth();
    const year = date.getFullYear();
    const day = date.getDate();
    return {
      MONTHS,

      // how close to the edge the user has to scroll before loading new messages
      offset: 200,

      date, month, year, day,
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
