<style lang="scss" scoped>
@import '../css/style';

.main-content {
  display: flex;
  flex: 1;
  position: relative;
}

@media screen and (max-width: 600px) {
  .main-content {
    flex-direction: column;
    margin-bottom: 24px;
  }
}

</style>

<template>
  <div class="main-content">
    <slot/>
  </div>
</template>

<script>
import Vue from 'vue';

export default Vue.component('page-content', {
  props: [],
});
</script>