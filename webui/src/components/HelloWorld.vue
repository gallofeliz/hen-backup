<template>
  <div v-if="config">

  <b-form inline>
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

    <b-form-checkbox class="mb-2 mr-sm-2 mb-sm-0" v-model="filterHostname">Hostname {{config.hostname}}</b-form-checkbox>

    <b-button variant="primary" @click="search()" :disabled="loadingResults">Show</b-button>
  </b-form>

  <div v-if="results">
<b-table striped hover :items="results" :fields="['Date', 'Hostname', 'Backup', 'Repository', 'Id', { key: 'actions', label: 'Actions' }]">


      <template #cell(actions)="row">
        <b-button size="sm" @click="showDetails(row.item.Repository, row.item.Id)">
          Details
        </b-button>
      </template>



</b-table>

  </div>

  </div>
</template>

<script>
export default {
  inject: ['client'],
  props: {
  },
  data() {
    return {
      config: null,
      filterBackup: null,
      filterRepository: null,
      filterHostname: false,
      results: null,
      loadingResults: false
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
      this.loadingResults = true
      this.results = null
      this.results = await this.client.request({method: "list_snapshots", params: {
        repository_name: this.filterRepository,
        hostname: this.filterHostname ? this.config.hostname : null,
        backup_name: this.filterBackup,
        reverse: true
      }})
      this.loadingResults = false
    }
  }





}
</script>

<style scoped>

</style>
