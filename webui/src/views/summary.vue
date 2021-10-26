<template>
  <div>
    <div v-if="summary">
      <h1>Backups</h1>
      <div v-for="(backupStatus, backupName) in summary.backups" :key="backupName" class="status-element">
        <b-icon-building class="icon"></b-icon-building>
        {{backupName}}
        <p>
          Last run :
          <span v-if="backupStatus.lastArchivedJob">
            {{ backupStatus.lastArchivedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': backupStatus.lastArchivedJob.state !== 'success' }" v-b-tooltip.hover :title="backupStatus.lastArchivedJob.error">{{ backupStatus.lastArchivedJob.state }}</span>
          </span>
          <span v-else>Unknown</span>
          <br />
          Next run :
            <span v-if="backupStatus.runningJob">
              Running since {{ backupStatus.runningJob.startedAt | formatAgo }}
            </span>
            <span v-else-if="backupStatus.queueJob">
              Queued since {{ backupStatus.queueJob.createdAt | formatAgo }}
            </span>
            <span v-else-if="backupStatus.nextSchedule">
              Scheduled to {{ backupStatus.nextSchedule | formatTo }}
            </span>
            <span v-else>
              Unknown
            </span>
        </p>
        <p>
          <b-button size="sm" variant="primary" disabled>Backup now</b-button>
        </p>
      </div>
      <h1>Repositories checks</h1>
      <h1>Backups prunes</h1>
    </div>
  </div>
</template>

<script>

import * as moment from 'moment'
import { BIconBuilding } from 'bootstrap-vue'

export default {
  inject: ['backgroundClient'],
  components: {
    BIconBuilding
  },
  props: {
  },
  filters: {
    formatAgo(date) {
      if (!date) {
        throw new Error('Invalid date')
      }
      return moment(date).fromNow()
    },
    formatTo(date) {
      if (!date) {
        throw new Error('Invalid date')
      }
      return 'in ' + moment(date).toNow(true)
    }
  },
  created() {
    this.retrieveSummary()
    // Use https://www.npmjs.com/package/express-ws to get realtime jobs changes ?
    this.timer = setInterval(() => {
      this.retrieveSummary()
    }, 5000)
  },
  methods: {
    async retrieveSummary() {
        this.summary = await this.backgroundClient.getSummary()
    },
    cancelAutoUpdate() {
        clearInterval(this.timer)
    }
  },
  data() {
    return {
        summary: null,
        timer: null
    }
  },
  beforeDestroy () {
    this.cancelAutoUpdate();
  }
}
</script>

<style scoped>
    .status-element {
        display: inline-block;
        border: 1px solid grey;
        margin-right: 15px;
        margin-bottom: 15px;
        padding: 15px 10px 0 10px;
    }
    .status-element .icon {
        width: 40px;
        height: 40px;
        margin: 0 10px 10px 0;
        vertical-align: middle;
    }
</style>
