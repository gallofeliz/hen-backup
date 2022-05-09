<template>
  <div>
    <div v-if="summary">
      <h1>Backups</h1>
      <div v-for="(operations, backupName) in summary.backups" :key="backupName" class="status-element">
        <b-icon-building class="icon"></b-icon-building>
        {{backupName}}
        <p>
          Last backup :
          <span v-if="operations.backup.lastEndedJob">
            {{ operations.backup.lastEndedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': operations.backup.lastEndedJob.state !== 'done' }" v-b-tooltip.hover :title="operations.backup.lastEndedJob.error">{{ operations.backup.lastEndedJob.state }}</span>
          </span>
          <span v-else>Unknown</span>
          <br />
          Next backup :
            <span v-if="operations.backup.runningJob">
              Running since {{ operations.backup.runningJob.startedAt | formatAgo }}
            </span>
            <span v-else-if="operations.backup.queuingJob">
              Queued since {{ operations.backup.queuingJob.createdAt | formatAgo }}
            </span>
            <span v-else-if="operations.backup.nextSchedule">
              Scheduled for {{ operations.backup.nextSchedule | formatTo }}
            </span>
            <span v-else>
              No scheduled
            </span>
        </p>
        <p>
          <router-link :to="{ name: 'jobs', query: { operation: 'backup', backup: backupName }}" class="mr-2">See backups history</router-link>

          <run-button text="Backup" @click="runBackup(backupName, $event)" style="float: right"></run-button>
        </p>

        <p>
          Last prune :
          <span v-if="operations.prune.lastEndedJob">
            {{ operations.prune.lastEndedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': operations.prune.lastEndedJob.state !== 'done' }" v-b-tooltip.hover :title="operations.prune.lastEndedJob.error">{{ operations.prune.lastEndedJob.state }}</span>
          </span>
          <span v-else>Unknown</span>
          <br />
          Next prune :
            <span v-if="operations.prune.runningJob">
              Running since {{ operations.prune.runningJob.startedAt | formatAgo }}
            </span>
            <span v-else-if="operations.prune.queueJob">
              Queued since {{ operations.prune.queueJob.createdAt | formatAgo }}
            </span>
            <span v-else-if="operations.prune.nextSchedule">
              Scheduled for {{ operations.prune.nextSchedule | formatTo }}
            </span>
            <span v-else>
              No scheduled
            </span>
        </p>

        <p>
          <router-link :to="{ name: 'jobs', query: { operation: 'prune', backup: backupName }}" class="mr-2">See prunes history</router-link>

          <run-button text="Prune" @click="runPrune(backupName, $event)" style="float: right"></run-button>
        </p>
      </div>

      <h1>Repositories</h1>
      <div v-for="(operations, repositoryName) in summary.repositories" :key="repositoryName" class="status-element">
        <b-icon-server class="icon"></b-icon-server>
        {{repositoryName}} <span v-if="repositoriesStats[repositoryName] && Object.keys(repositoriesStats[repositoryName]).length > 0">(<span class="repostat" v-if="repositoriesStats[repositoryName].size">{{repositoriesStats[repositoryName].size | formatSize}}</span><span class="repostat" v-if="repositoriesStats[repositoryName].billing">{{repositoriesStats[repositoryName].billing | formatBilling}}</span>)</span>
        <p>
          Last check :
          <span v-if="operations.checkRepository.lastEndedJob">
            {{ operations.checkRepository.lastEndedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': operations.checkRepository.lastEndedJob.state !== 'done' }" v-b-tooltip.hover :title="operations.checkRepository.lastEndedJob.error">{{ operations.checkRepository.lastEndedJob.state }}</span>
          </span>
          <span v-else>Unknown</span>
          <br />
          Next check :
            <span v-if="operations.checkRepository.runningJob">
              Running since {{ operations.checkRepository.runningJob.startedAt | formatAgo }}
            </span>
            <span v-else-if="operations.checkRepository.queueJob">
              Queued since {{ operations.checkRepository.queueJob.createdAt | formatAgo }}
            </span>
            <span v-else-if="operations.checkRepository.nextSchedule">
              Scheduled for {{ operations.checkRepository.nextSchedule | formatTo }}
            </span>
            <span v-else>
              No scheduled
            </span>
        </p>
        <p>
          <router-link :to="{ name: 'jobs', query: { operation: 'check', repository: repositoryName }}" class="mr-2">See history</router-link>

          <run-button text="Check" @click="runCheck(repositoryName, $event)" style="float: right"></run-button>
        </p>
      </div>

    </div>
  </div>
</template>

<script>

import * as moment from 'moment'
import { BIconBuilding, BIconServer } from 'bootstrap-vue'
import RunButton from '../components/RunButton.vue'

export default {
  inject: ['backgroundClient', 'foregroundClient'],
  components: {
    BIconBuilding, BIconServer, RunButton
  },
  props: {
  },
  filters: {
    formatSize(sizeStat) {
      let str = sizeStat.value + 'B'
      if (sizeStat.shareName) {
        str += ' shared ' + sizeStat.shareName
      }
      return str
    },
    formatBilling(billingStat) {
      let str = billingStat.value + ' ' + billingStat.currency
      if (billingStat.shareName) {
        str += ' shared ' + billingStat.shareName
      }
      return str
    },
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
    this.retrieveStats()
    // Use https://www.npmjs.com/package/express-ws to get realtime jobs changes ?
    this.timer = setInterval(() => {
      this.retrieveSummary()
    }, 5000)
  },
  methods: {
    async retrieveSummary() {
        this.summary = await this.backgroundClient.getSummary()
    },
    async retrieveStats() {
        this.repositoriesStats = await this.backgroundClient.getRepositoriesStats()
    },
    cancelAutoUpdate() {
        clearInterval(this.timer)
    },
    async runBackup(backup, priority) {
      await this.foregroundClient.backup(backup, priority)

      this.retrieveSummary()
    },
    async runPrune(backup, priority) {
      await this.foregroundClient.prune(backup, priority)

      this.retrieveSummary()
    },
    async runCheck(repository, priority) {
      await this.foregroundClient.check(repository, priority)

      this.retrieveSummary()
    }
  },
  data() {
    return {
        summary: null,
        timer: null,
        repositoriesStats: {}
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
    .repostat:not(:first-child)::before {
        content: ' | ';
    }
</style>
