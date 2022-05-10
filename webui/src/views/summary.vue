<template>
  <div>

    Todo :
       - Add warnings badges
       - Line danger on links that have 1 or more failed (add "report" on failed errors ?)

    <div v-if="summary">

<div class="container-fluid">
  <div class="row">
    <div class="col-sm">

      <h1>Backups</h1>
      <div v-for="(operations, backupName) in summary.backups" :key="backupName" class="status-element" :class="{'border-danger': (operations.backup.lastEndedJob &&  operations.backup.lastEndedJob.state === 'failed') || (operations.prune.lastEndedJob && operations.prune.lastEndedJob.state === 'failed')}" :ref="'backup-' + backupName">
        <b-icon-building class="icon"></b-icon-building>
        {{backupName}}
        <p>
          Last backup :
          <span v-if="operations.backup.lastEndedJob">
            {{ operations.backup.lastEndedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': operations.backup.lastEndedJob.state === 'failed' }" v-b-tooltip.hover :title="operations.backup.lastEndedJob.error">{{ operations.backup.lastEndedJob.state }}</span>
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
            <span :class="{'badge badge-danger': operations.prune.lastEndedJob.state === 'failed' }" v-b-tooltip.hover :title="operations.prune.lastEndedJob.error">{{ operations.prune.lastEndedJob.state }}</span>
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

    </div>

    <div class="col-md-auto" style="min-width: 100px">
    </div>

    <div class="col-sm">
      <h1>Repositories</h1>
      <div v-for="(operations, repositoryName) in summary.repositories" :key="repositoryName" class="status-element" :class="{'border-danger': (operations.checkRepository.lastEndedJob &&  operations.checkRepository.lastEndedJob.state === 'failed')}" :ref="'repository-' + repositoryName">
        <b-icon-server class="icon"></b-icon-server>
        {{repositoryName}} <span v-if="repositoriesStats[repositoryName] && Object.keys(repositoriesStats[repositoryName]).length > 0">(<span class="repostat" v-if="repositoriesStats[repositoryName].size">{{repositoriesStats[repositoryName].size | formatSize}}</span><span class="repostat" v-if="repositoriesStats[repositoryName].billing">{{repositoriesStats[repositoryName].billing | formatBilling}}</span>)</span>
        <p>
          Last check :
          <span v-if="operations.checkRepository.lastEndedJob">
            {{ operations.checkRepository.lastEndedJob.endedAt | formatAgo }},
            <span :class="{'badge badge-danger': operations.checkRepository.lastEndedJob.state === 'failed' }" v-b-tooltip.hover :title="operations.checkRepository.lastEndedJob.error">{{ operations.checkRepository.lastEndedJob.state }}</span>
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
  async created() {
    this.config = await this.foregroundClient.getConfig()

    this.retrieveSummary()

    this.windowResizeHandler = () => this.redraw()

    window.addEventListener('resize', this.windowResizeHandler)

    this.retrieveStats()
    // Use https://www.npmjs.com/package/express-ws to get realtime jobs changes ?
    this.timer = setInterval(() => {
      this.retrieveSummary()
    }, 5000)
  },
  methods: {
    cleanDraw() {
      document.querySelectorAll('.entities-lines').forEach(n => n.remove())
    },
    redraw() {
      this.cleanDraw()

      this.config.backups.forEach(backup => {
        backup.repositories.forEach(repositoryName => {
          this.drawLine(backup.name, repositoryName)
        })
      })
    },
    async retrieveSummary() {
        this.summary = await this.backgroundClient.getSummary()

        this.$nextTick(() => this.redraw())
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
    },
    drawLine(backup, repository) {
      const getOffset = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left + window.pageXOffset,
          top: rect.top + window.pageYOffset,
          width: rect.width || el.offsetWidth,
          height: rect.height || el.offsetHeight
        };
      }

      const connect = (div1, div2, color, thickness) => {
        const off1 = getOffset(div1);
        const off2 = getOffset(div2);

        const x1 = off1.left + off1.width;
        const y1 = off1.top + off1.height / 2;

        const x2 = off2.left;
        const y2 = off2.top + off2.height / 2;

        const length = Math.sqrt(((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1)));

        const cx = ((x1 + x2) / 2) - (length / 2);
        const cy = ((y1 + y2) / 2) - (thickness / 2);

        const angle = Math.atan2((y1 - y2), (x1 - x2)) * (180 / Math.PI);

        const htmlLine = "<div class='entities-lines' style='padding:0px; margin:0px; height:" + thickness + "px; background-color:" + color + "; line-height:1px; position:absolute; left:" + cx + "px; top:" + cy + "px; width:" + length + "px; -moz-transform:rotate(" + angle + "deg); -webkit-transform:rotate(" + angle + "deg); -o-transform:rotate(" + angle + "deg); -ms-transform:rotate(" + angle + "deg); transform:rotate(" + angle + "deg);' />";

        const p = document.createElement('div')
        p.innerHTML = htmlLine

        const line = p.querySelector('div')

        document.body.append(line);
      }

      const d1 = this.$refs['backup-' + backup][0]
      const d2 = this.$refs['repository-' + repository][0]
      connect(d1, d2, 'grey', 2)
    }
  },
  data() {
    return {
        summary: null,
        timer: null,
        windowResizeHandler: null,
        config: null,
        repositoriesStats: {}
    }
  },
  beforeDestroy () {
    this.cancelAutoUpdate();
    window.removeEventListener('resize', this.windowResizeHandler)
    this.cleanDraw()
  }
}
</script>

<style scoped>
    .status-element.border-danger {
      border-width: 3px;
    }
    .status-element {
        border: 1px solid grey;
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
