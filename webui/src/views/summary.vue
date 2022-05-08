<template>
  <div>

TODO : Separate repositories and backups, no backups and prune

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
              Scheduled for {{ backupStatus.nextSchedule | formatTo }}
            </span>
            <span v-else>
              No scheduled
            </span>
        </p>
        <p>
          <router-link :to="{ name: 'jobs', query: { operation: 'backup', backup: backupName }}" class="mr-2">See history</router-link>

          <run-button text="Backup" @click="runBackup(backupName, $event)" style="float: right"></run-button>
        </p>
      </div>

      <h1>Repositories checks</h1>
      <div v-for="(checkStatus, repositoryName) in summary.checks" :key="repositoryName" class="status-element">
        <b-icon-server class="icon"></b-icon-server>
        {{repositoryName}} <span v-if="repositoriesStats[repositoryName] && Object.keys(repositoriesStats[repositoryName]).length > 0">(<span class="repostat" v-if="repositoriesStats[repositoryName].size">{{repositoriesStats[repositoryName].size | formatSize}}</span><span class="repostat" v-if="repositoriesStats[repositoryName].billing">{{repositoriesStats[repositoryName].billing | formatBilling}}</span>)</span>
        <p>
          Last run :
          <span v-if="checkStatus.lastArchivedJob">
            {{ checkStatus.lastArchivedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': checkStatus.lastArchivedJob.state !== 'success' }" v-b-tooltip.hover :title="checkStatus.lastArchivedJob.error">{{ checkStatus.lastArchivedJob.state }}</span>
          </span>
          <span v-else>Unknown</span>
          <br />
          Next run :
            <span v-if="checkStatus.runningJob">
              Running since {{ checkStatus.runningJob.startedAt | formatAgo }}
            </span>
            <span v-else-if="checkStatus.queueJob">
              Queued since {{ checkStatus.queueJob.createdAt | formatAgo }}
            </span>
            <span v-else-if="checkStatus.nextSchedule">
              Scheduled for {{ checkStatus.nextSchedule | formatTo }}
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

      <h1>Backups prunes</h1>
      <div v-for="(pruneStatus, backupName) in summary.prunes" :key="backupName" class="status-element">
        <b-icon-scissors class="icon"></b-icon-scissors>
        {{backupName}}
        <p>
          Last run :
          <span v-if="pruneStatus.lastArchivedJob">
            {{ pruneStatus.lastArchivedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': pruneStatus.lastArchivedJob.state !== 'success' }" v-b-tooltip.hover :title="pruneStatus.lastArchivedJob.error">{{ pruneStatus.lastArchivedJob.state }}</span>
          </span>
          <span v-else>Unknown</span>
          <br />
          Next run :
            <span v-if="pruneStatus.runningJob">
              Running since {{ pruneStatus.runningJob.startedAt | formatAgo }}
            </span>
            <span v-else-if="pruneStatus.queueJob">
              Queued since {{ pruneStatus.queueJob.createdAt | formatAgo }}
            </span>
            <span v-else-if="pruneStatus.nextSchedule">
              Scheduled for {{ pruneStatus.nextSchedule | formatTo }}
            </span>
            <span v-else>
              No scheduled
            </span>
        </p>
        <p>
          <router-link :to="{ name: 'jobs', query: { operation: 'prune', backup: backupName }}" class="mr-2">See history</router-link>

          <run-button text="Prune" @click="runPrune(backupName, $event)" style="float: right"></run-button>

        </p>
      </div>
    </div>
  </div>
</template>

<script>

import * as moment from 'moment'
import { BIconBuilding, BIconScissors, BIconServer } from 'bootstrap-vue'
import RunButton from '../components/RunButton.vue'

export default {
  inject: ['backgroundClient', 'foregroundClient'],
  components: {
    BIconBuilding, BIconScissors, BIconServer, RunButton
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
