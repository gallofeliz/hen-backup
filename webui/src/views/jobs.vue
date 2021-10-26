<template>
  <div>
    <div v-if="jobs">
      <h1>Queue</h1>
      <b-table striped hover :items="jobs.queue" :fields="['uuid', 'createdAt', 'state', 'priority', 'trigger', 'operation', 'subjects']">
        <template #cell(createdAt)="row">
          {{ row.item.createdAt | formatDate }}
        </template>
      </b-table>
      <h1>Running</h1>
      <b-table striped hover :items="jobs.running" :fields="['uuid', 'createdAt', 'startedAt', 'state', 'priority', 'trigger', 'operation', 'subjects']">

        <template #cell(createdAt)="row">
          {{ row.item.createdAt | formatDate }}
        </template>

        <template #cell(startedAt)="row">
          {{ row.item.startedAt | formatDate }}
        </template>
      </b-table>
      <h1>Archive</h1>
      <b-table striped hover :items="jobs.archived" :fields="['uuid', 'createdAt', 'startedAt', 'endedAt', 'state', 'priority', 'trigger', 'operation', 'subjects']">

        <template #cell(createdAt)="row">
          {{ row.item.createdAt | formatDate }}
        </template>

        <template #cell(startedAt)="row">
          {{ row.item.startedAt | formatDate }}
        </template>

        <template #cell(endedAt)="row">
          {{ row.item.endedAt | formatDate }}
        </template>

        <template #cell(state)="row">
          <span class="job-error" v-if="row.item.state === 'failure'" v-b-tooltip.hover :title="row.item.error">{{ row.item.state }}</span>
          <span v-else>{{ row.item.state }}</span>
        </template>

      </b-table>
    </div>
  </div>
</template>

<script>

import * as moment from 'moment'

export default {
  inject: ['backgroundClient'],
  props: {
  },
  filters: {
    formatDate(date) {
      if (!date) {
        throw new Error('Invalid date')
      }
      return moment(date).format()
    },
  },
  created() {
    this.retrieveJobs()
    // Use https://www.npmjs.com/package/express-ws to get realtime jobs changes ?
    this.timer = setInterval(() => {
      this.retrieveJobs()
    }, 5000)
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
