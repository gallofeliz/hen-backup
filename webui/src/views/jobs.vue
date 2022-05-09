<template>
  <div>
    <div v-if="filteredJobs">
      <h1>Queueing</h1>
      <b-table striped hover :items="filteredJobs.queueing" :fields="['uuid', 'createdAt', 'state', 'priority', 'trigger', 'operation', 'subjects']" :sort-by="'createdAt'" :sort-desc="false">
        <template #cell(createdAt)="row">
          {{ row.item.createdAt | formatDate }}
          (queuing since {{ row.item.createdAt | formatAgo }})
        </template>

        <template #cell(operation)="row">
          {{ row.item.id.operation }}
        </template>

        <template #cell(trigger)="row">
          {{ row.item.id.trigger }}
        </template>

        <template #cell(subjects)="row">
          {{ row.item.id.subjects }}
        </template>
      </b-table>
      Cancel ? Change priority ?
      <h1>Running</h1>
      <b-table striped hover :items="filteredJobs.running" :fields="['uuid', 'createdAt', 'startedAt', 'state', 'priority', 'trigger', 'operation', 'subjects', { key: 'actions', label: 'Actions' }]" :sort-by="'startedAt'" :sort-desc="false">
        <template #cell(createdAt)="row">
          {{ row.item.createdAt | formatDate }}
          (queued during {{ row.item.createdAt | formatDuring(row.item.startedAt) }})
        </template>

        <template #cell(startedAt)="row">
          {{ row.item.startedAt | formatDate }}
          (running since {{ row.item.startedAt | formatAgo }})
        </template>
        <template #cell(actions)="row">
          <b-button size="sm" @click="showDetails(row.item.uuid)">
            Details
          </b-button>
        </template>

        <template #cell(operation)="row">
          {{ row.item.id.operation }}
        </template>

        <template #cell(trigger)="row">
          {{ row.item.id.trigger }}
        </template>

        <template #cell(subjects)="row">
          {{ row.item.id.subjects }}
        </template>

      </b-table>
      Abort ?
      <h1>Ended</h1>
      Filters here
      <b-table striped hover :items="filteredJobs.ended" :fields="['uuid', 'createdAt', 'startedAt', 'endedAt', 'state', 'priority', 'trigger', 'operation', 'subjects', { key: 'actions', label: 'Actions' }]" :sort-by="'endedAt'" :sort-desc="true">

        <template #cell(createdAt)="row">
          {{ row.item.createdAt | formatDate }}
          (queued during {{ row.item.createdAt | formatDuring(row.item.startedAt) }})
        </template>

        <template #cell(startedAt)="row">
          {{ row.item.startedAt | formatDate }}
          (run during {{ row.item.startedAt | formatDuring(row.item.endedAt) }})
        </template>

        <template #cell(endedAt)="row">
          {{ row.item.endedAt | formatDate }}
          (ended since {{ row.item.endedAt | formatAgo }})
        </template>

        <template #cell(operation)="row">
          {{ row.item.id.operation }}
        </template>

        <template #cell(trigger)="row">
          {{ row.item.id.trigger }}
        </template>

        <template #cell(subjects)="row">
          {{ row.item.id.subjects }}
        </template>

        <template #cell(state)="row">
          <span v-if="row.item.state === 'failed'" v-b-tooltip.hover :title="row.item.error" class="badge badge-danger">{{ row.item.state }}</span>
          <span v-else>{{ row.item.state }} </span>
          <span v-if="row.item.warnings.length > 0" class="badge badge-warning">{{row.item.warnings.length}} warnings</span>
        </template>

        <template #cell(actions)="row">
          <b-button size="sm" @click="showDetails(row.item.uuid)">
            See logs
          </b-button>
        </template>

      </b-table>
      Retry ?
    </div>

    <b-modal ref="my-modal" :title="explain.title" size="xl" scrollable>
      <div class="d-block" v-if="explain.runLogs">
        <pre>{{explain.runLogs}}</pre>
      </div>
      <template #modal-footer>
        <div>
        </div>
      </template>
    </b-modal>


  </div>
</template>

<script>

import * as moment from 'moment'

export default {
  inject: ['backgroundClient', 'foregroundClient'],
  props: {
    operation: String,
    repository: String,
    backup: String
  },
  filters: {
    formatDuring(date1, date2) {
      if (!date1 || !date2) {
        throw new Error('Invalid date')
      }
      return moment(date2).from(date1, true)
    },
    formatAgo(date) {
      if (!date) {
        throw new Error('Invalid date')
      }
      return moment(date).fromNow()
    },
    formatDate(date) {
      if (!date) {
        throw new Error('Invalid date')
      }
      return moment(date).format()
    },
  },
  computed: {
    filteredJobs() {
      const filter = (jobs) => {
        return jobs.filter(job => {
          if (this.operation && job.id.operation !== this.operation) {
            return false
          }

          if (this.repository && (job.id.subjects || {}).repository !== this.repository) {
            return false
          }

          if (this.backup && (job.id.subjects || {}).backup !== this.backup) {
            return false
          }

          return true
        })
      }

      return this.jobs && {
        queueing: filter(this.jobs.queueing),
        running: filter(this.jobs.running),
        ended: filter(this.jobs.ended)
      }
    }
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
    },
    async showDetails(uuid) {
      this.explain = {
        runLogs: [],
        title: 'Job ' + uuid + ' logs (realtime)'
      }

      // TODO : Fix this shitty code
        this.$nextTick(() => {
      this.$nextTick(() => {
        setTimeout(() => {
        const modal = this.$refs['my-modal'].getActiveElement()
        const modalBody = modal && modal.querySelector('.modal-body')

        if (!modalBody) {
          console.log('pas possible')
          return
        }
          this.$nextTick(() => {
              modalBody.scrollTop = Number.MAX_SAFE_INTEGER
          })
        }, 250)

        })
      })

      const logsListener = this.foregroundClient.getJobRealtimeLogs(uuid)

      logsListener.on('log', (log) => {
        this.explain.runLogs.push(log)
        const modal = this.$refs['my-modal'].getActiveElement()
        const modalBody = modal && modal.querySelector('.modal-body')

        if (!modalBody) {
          return
        }

        const isAtBottom = modalBody.scrollTop + modalBody.offsetHeight === modalBody.scrollHeight

        if (!isAtBottom) {
          return
        }

        this.$nextTick(() => {
          this.$nextTick(() => {
              modalBody.scrollTop = Number.MAX_SAFE_INTEGER
          })
        })
      })

      logsListener.once('end', () => {
        logsListener.removeAllListeners()
      })

      this.$refs['my-modal'].$once('hide', () => {
        logsListener.removeAllListeners()
        logsListener.abort()
      })

      this.$refs['my-modal'].show()
    },
    hideDetails() {
      this.$refs['my-modal'].hide()
      this.explain = {
        title: null,
        runLogs: null
      }
    }
  },
  data() {
    return {
        jobs: null,
        timer: null,
        explain: {
          title: null,
          runLogs: null
        }
    }
  },
  beforeDestroy () {
    this.cancelAutoUpdate();
  }
}
</script>

<style scoped>
</style>
