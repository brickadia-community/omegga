<style lang="scss" scoped>
@import '../css/style';

.content-parent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 100%;
}

.content {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 24px;
}

</style>

<template>
  <div>
    <br-background />
    <div class="content-parent">
      <div class="content" v-if="!loading">
        <slot/>
      </div>
    </div>
  </div>
</template>

<script>
import Vue from 'vue';

export default Vue.component('page', {
  props: ['loading'],
});
</script>