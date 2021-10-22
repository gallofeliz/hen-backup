<template>
  <div v-if="jobs">

    <h1>Queue</h1>
    <b-table striped hover :items="jobs.queue">
    </b-table>
    <h1>Running</h1>
    <b-table striped hover :items="jobs.running">
    </b-table>
    <h1>Archive</h1>
    <b-table striped hover :items="jobs.archived">

      <template #cell(state)="row">
        <span :class="{ 'job-error': row.item.state === 'failure' }">{{ row.item.state }}</span>
      </template>

    </b-table>

  </div>
</template>


<script>

export default {
  inject: ['backgroundClient'],
  props: {
  },
  created() {
    this.retrieveJobs()
    // Use https://www.npmjs.com/package/express-ws to get realtime jobs changes ?
    this.timer = setInterval(() => this.retrieveJobs(), 5000)
  },
  methods: {
    async retrieveJobs() {
        this.jobs = await this.backgroundClient.getJobs()
    },
    cancelAutoUpdate() {
        clearInterval(this.timer)
    }
  },
  data() {
    return {
        jobs: null,
        timer: null
    }
  },
  beforeDestroy () {
    this.cancelAutoUpdate();
  }
}
</script>

<style scoped>
    .job-error {
        color: red;
    }
</style>
