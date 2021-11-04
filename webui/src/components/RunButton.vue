<template>
  <div>
    <b-dropdown :text="text" size="sm" variant="primary">
      <b-dropdown-item size="sm" @click="runCb()">With default priority</b-dropdown-item>
      <b-dropdown-item size="sm" @click="runCb('immediate')">Immediatly</b-dropdown-item>
      <b-dropdown-item size="sm" @click="runCb('next')">Nextly</b-dropdown-item>
      <b-dropdown-item size="sm" @click="runCb('superior')">Superiorly</b-dropdown-item>
      <b-dropdown-item size="sm" @click="runCb('normal')">Normaly</b-dropdown-item>
      <b-dropdown-item size="sm" @click="runCb('inferior')">Inferiorly</b-dropdown-item>
      <b-dropdown-item size="sm" @click="runCb('on-idle')">On idle</b-dropdown-item>
    </b-dropdown>
  </div>
</template>

<script>
export default {
  props: {
    text: String,
    click: Function
  },
  methods: {
    runCb(priority) {
      this.$emit('click', priority)
    }
  }
}
</script>

<style scoped>

</style>
