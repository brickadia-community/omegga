<style scoped>
.chat-timestamp {
  align-self: center;
  font-size: 16px;
  margin-right: 8px;
  font-weight: bold;
  text-align: right;
  width: 75px;
  min-width: 75px;
  color: #ccc;
}

</style>

<template>
  <span class="chat-timestamp">
    {{hours}}:{{minutes}} {{pm}}
  </span>
</template>
<script>

import Vue from 'vue';

export default Vue.component('chat-time', {
  props: ['time'],
  created() {
    const date = new Date(this.time);
    this.hours = date.getHours();
    this.pm = this.hours >= 12 ? 'PM' : 'AM';
    if (this.hours > 12) {
      this.hours -= 12;
    } else if (this.hours === 0) {
      this.hours = 12;
    }
    this.minutes = (date.getMinutes() + '').padStart(2, '0');
  },
});

</script>