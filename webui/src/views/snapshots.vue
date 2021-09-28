<template>
  <div v-if="config">

  <b-form inline class="mb-2">
    <label class="mr-sm-2" for="inline-form-custom-select-pref">Backup</label>
    <b-form-select
      class="mb-2 mr-sm-2 mb-sm-0"
      :options="optionsBackup"
      v-model="filterBackup"
      @change="checkRepoEnable()"
    ></b-form-select>

    <label class="mr-sm-2" for="inline-form-custom-select-pref">Repositories</label>
    <b-form-select
      class="mb-2 mr-sm-2 mb-sm-0"
      :options="optionsRepositories"
      v-model="filterRepository"
    ></b-form-select>

    <b-button class="mb-2 mr-sm-2 mb-sm-0" variant="primary" @click="search()">Show</b-button>

    <div v-if="results">
      <span class="ml-sm-3">{{ resultsStats.count }} snapshots found</span>
    </div>
  </b-form>

  <div v-if="results">
    <b-table striped hover :items="results" :fields="['Date', 'Backup', 'Repository', 'Id', { key: 'actions', label: 'Actions' }]">

      <template #cell(Date)="row">
        {{ row.item.Date | formatDate }}
      </template>

      <template #cell(actions)="row">
        <b-button size="sm" @click="showDetails(row.item.Repository, row.item.Id)">
          Details
        </b-button>
      </template>

    </b-table>

  </div>

    <b-modal ref="my-modal" :title="explain.title" size="xl" scrollable>
      <div class="d-block">

        <b-table striped hover :items="explain.objects" :fields="['path', 'permissions', 'uid', 'gid', 'size', 'mtime', { key: 'actions', label: 'Actions' }]">

          <template #cell(mtime)="row">
            {{ row.item.mtime | formatDate }}
          </template>

          <template #cell(size)="row">
            <span v-if="row.item.size !== undefined">
              {{ row.item.size | prettyBytes }}
            </span>
          </template>

          <template #cell(actions)="row">
            <b-button size="sm" @click="showDetails(row.item.Repository, row.item.Id)" disabled>
              History
            </b-button>
            <b-button size="sm" disabled>
              Restore
            </b-button>
            <b-button size="sm" disabled>
              Download
            </b-button>
          </template>
        </b-table>

      </div>
      <template #modal-footer>
        <div>
          <b-button size="sm" class="mr-2" disabled>
            Restore
          </b-button>
          <b-button size="sm" variant="primary" @click="downloadSnapshot()">
            Download
          </b-button>
        </div>
      </template>
    </b-modal>

  </div>
</template>

<script>

import * as moment from 'moment'

export default {
  inject: ['client'],
  props: {
  },
  filters: {
    formatDate(date) {
      return moment(date).format()
    }
  },
  data() {
    return {
      config: null,
      filterBackup: null,
      filterRepository: null,
      results: null,
      explain: {
        title: null,
        objects: null
      }
    }
  },
  computed: {
    optionsBackup() {
      return [{text: '', value: null}].concat(Object.keys(this.config.backups).map(name => ({text: name, value: name })))
    },
    optionsRepositories() {
      if (this.filterBackup) {
        return [{text: '', value: null}].concat(this.config.backups[this.filterBackup].repositories.map(name => ({text: name, value: name })))
      }

      return [{text: '', value: null}].concat(Object.keys(this.config.repositories).map(name => ({text: name, value: name })))
    },
    resultsStats() {
      return {
        count: this.results.length
      }
    }
  },
  async created() {
    this.config = await this.client.request({method: "get_config_summary", params: []})
  },
  methods: {
    checkRepoEnable() {
      if (this.filterBackup && this.filterRepository && !this.optionsRepositories.map(repo => repo.value).includes(this.filterRepository)) {
        this.filterRepository = null
      }
    },
    async search() {
      this.results = null
        this.results = await this.client.request({method: "list_snapshots", params: {
          repository_name: this.filterRepository,
          backup_name: this.filterBackup,
          reverse: true
        }})
    },
    async downloadSnapshot() {

    },
    async showDetails(repository, snapshotId) {

      this.explain = await this.client.request({method: "explain_snapshot", params: {
        repository_name: repository,
        snapshot_id: snapshotId
      }})

      this.explain.title = `Snapshot ${this.explain.snapshot_id} of backup ${this.explain.backup_name} on repository ${this.explain.repository_name}`

      this.$refs['my-modal'].show()
    },
    hideDetails() {
      this.$refs['my-modal'].hide()
      this.explain = {
        title: null,
        objects: null
      }
    }
  }

}
</script>

<style scoped>

</style>
