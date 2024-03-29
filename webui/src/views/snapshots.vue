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
    <b-table striped hover :items="results" :fields="['date', 'backup', 'repository', 'id', 'job',{ key: 'actions', label: 'Actions' }]" :sort-by="'date'" :sort-desc="true">

      <template #cell(date)="row">
        {{ row.item.date | formatDate }}
      </template>

      <template #cell(actions)="row">
        <b-button size="sm" @click="showDetails(row.item.repository, row.item.id)">
          Details
        </b-button>
      </template>

    </b-table>

    - Delete selected snapshots

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
            <b-button size="sm" class="mr-2" disabled>
              History
            </b-button>
            <b-button size="sm" class="mr-2" disabled>
              Restore
            </b-button>
            <b-dropdown right text="Download" size="sm" variant="primary" v-if="row.item.type==='dir'">
              <b-dropdown-item size="sm" @click="downloadSnapshot(row.item.path, 'tar', 'dir')">Download tar</b-dropdown-item>
              <b-dropdown-item size="sm" @click="downloadSnapshot(row.item.path, 'zip', 'dir')">Download zip</b-dropdown-item>
            </b-dropdown>
            <b-button size="sm" variant="primary" v-else @click="downloadSnapshot(row.item.path, null, 'file')">
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

          <b-dropdown right text="Download" size="sm" variant="primary">
            <b-dropdown-item size="sm" @click="downloadSnapshot('/', 'tar', 'dir')">Download tar</b-dropdown-item>
            <b-dropdown-item size="sm" @click="downloadSnapshot('/', 'zip', 'dir')">Download zip</b-dropdown-item>
          </b-dropdown>

        </div>
      </template>
    </b-modal>

  </div>
</template>

<script>

import * as moment from 'moment'

export default {
  inject: ['foregroundClient'],
  props: {
  },
  filters: {
    formatDate(date) {
      if (!date) {
        throw new Error('Invalid date')
      }
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
      return [{text: '', value: null}].concat(this.config.backups.map(backup => ({text: backup.name, value: backup.name })))
    },
    optionsRepositories() {
      if (this.filterBackup) {
        return [{text: '', value: null}].concat(this.config.backups.find(backup => backup.name === this.filterBackup).repositories.map(name => ({text: name, value: name })))
      }

      return [{text: '', value: null}].concat(this.config.repositories.map(repo => ({text: repo.name, value: repo.name })))
    },
    resultsStats() {
      return {
        count: this.results.length
      }
    }
  },
  async created() {
    this.config = await this.foregroundClient.getConfig()
  },
  methods: {
    checkRepoEnable() {
      if (this.filterBackup && this.filterRepository && !this.optionsRepositories.map(repo => repo.value).includes(this.filterRepository)) {
        this.filterRepository = null
      }
    },
    async search() {
      this.results = null
        this.results = await this.foregroundClient.listSnapshots({
          repository: this.filterRepository,
          backup: this.filterBackup,
          device: this.config.device
        })
    },
    downloadSnapshot(path, format, type) {
      window.location.href = this.foregroundClient.getDownloadSnapshotUrl(this.explain.repository, this.explain.id, path, format, type)
    },
    async showDetails(repository, snapshotId) {
      this.explain = await this.foregroundClient.getSnapshot(repository, snapshotId)

      this.explain.title = `Snapshot ${this.explain.id} of backup ${this.explain.backup} on repository ${this.explain.repository}`

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
