<template>
  <div id="app">

    <div v-if="loading > 0" class="loader"><img src="/1496.gif" /></div>

    <b-navbar toggleable="lg" type="dark" variant="info">
      <b-navbar-brand to="/">Hen-Backup WebUI</b-navbar-brand>

        <b-navbar-toggle target="nav-collapse"></b-navbar-toggle>

        <b-collapse id="nav-collapse" is-nav>
          <b-navbar-nav>
            <b-nav-item exact-active-class="active" to="/">Summary</b-nav-item>
            <b-nav-item exact-active-class="active" to="/jobs">Jobs</b-nav-item>
            <b-nav-item exact-active-class="active" to="/snapshots">Explore</b-nav-item>
            <b-nav-item exact-active-class="active" to="/search">Search</b-nav-item>
            <b-nav-item exact-active-class="active" to="/maintenance">Maintenance</b-nav-item>
          </b-navbar-nav>

          <b-navbar-nav class="ml-auto">

          <b-nav-text right v-if="config">
            Device {{config.device}}
          </b-nav-text>
        </b-navbar-nav>

        </b-collapse>
    </b-navbar>
    <div class="mb-3 mt-3 ml-3 mr-3">
      <router-view/>

    </div>
  </div>
</template>

<script>

import {EventEmitter} from 'events'
import _ from 'lodash'

class Client extends EventEmitter {
  async getConfig() {
    return this.call('/config')
  }
  async listSnapshots(criteria) {
    return this.call('/snapshots?' + new URLSearchParams(_.pickBy(criteria)).toString())
  }
  async getSnapshot(repository, snapshot) {
    return this.call('/snapshots/'+encodeURIComponent(repository)+'/'+encodeURIComponent(snapshot))
  }
  getDownloadSnapshotUrl(repository, snapshot, path, format, type) {
    return '/api/snapshots/'+encodeURIComponent(repository)+'/'+encodeURIComponent(snapshot)+'/content?' + new URLSearchParams({type, path, format}).toString()
  }
  getManualBackupUrl(backup, priority) {
    return '/api/backups/'+encodeURIComponent(backup)+'/manual-backup?' + new URLSearchParams(_.pickBy({priority})).toString()
  }
  async getJobs(query) {
    return this.call('/jobs?query=' + (query ? JSON.stringify(query) : ''))
  }
  async getJob(uuid) {
    return this.call('/jobs/'+encodeURIComponent(uuid)+'/abort')
  }
  async cancelJob(uuid) {
    return this.call(
      '/jobs/'+encodeURIComponent(uuid)+'/cancel',
      {json: false, method: 'POST'}
    )
  }
  async abortJob(uuid) {
    return this.call(
      '/jobs/'+encodeURIComponent(uuid)+'/abort',
      {json: false, method: 'POST'}
    )
  }
  getJobRealtimeLogs(uuid) {
    const logsListener = new EventEmitter
    const controller = new AbortController
    const signal = controller.signal

    logsListener.abort = () => {
      controller.abort()
    }

    ;(async () => {
      const reader = await this.call('/jobs/'+encodeURIComponent(uuid)+'/realtime-logs?from-begin=true', { json: false, stream: true, signal })
      let ddone = false

      while (!ddone) {
          let {done, value} = await reader.read()
          ddone = done
          value = new TextDecoder("utf-8").decode(value)
          const lines = value.split('\n').filter(l => l)
          const runLogs = lines.map(l => JSON.parse(l))

          runLogs.forEach(l => logsListener.emit('log', l))
      }
      logsListener.emit('end')
    })()

    return logsListener
  }
  async getSummary() {
    return this.call('/summary')
  }
  async backup(backup, priority) {
    return this.call(
      '/backups/'+encodeURIComponent(backup)+'/backup?' + new URLSearchParams(_.pickBy({priority})).toString(),
      {json: false, method: 'POST'}
    )
  }
  async prune(backup, priority) {
    return this.call(
      '/backups/'+encodeURIComponent(backup)+'/prune?' + new URLSearchParams(_.pickBy({priority})).toString(),
      {json: false, method: 'POST'}
    )
  }
  async check(repository, priority) {
    return this.call(
      '/repositories/'+encodeURIComponent(repository)+'/check?' + new URLSearchParams(_.pickBy({priority})).toString(),
      {json: false, method: 'POST'}
    )
  }
  async measureRepository(repository, priority) {
    return this.call(
      '/repositories/'+encodeURIComponent(repository)+'/measure?' + new URLSearchParams(_.pickBy({priority})).toString(),
      {json: false, method: 'POST'}
    )
  }
  async call(url, {json, method, stream, signal} = {}) {
    return this.handleEvents(async () => {
      const response = await fetch('/api' + url, {method: method || 'GET', signal})
      if (!response.ok) {
        throw new Error(await response.text())
      }
      if (json !== false) {
        return response.json()
      }
      if (stream === true) {
        return response.body.getReader()
      }
    })
  }
  async handleEvents(callFn) {
    try {
      this.emit('request')
      const response = await callFn()
      this.emit('response')
      return response
    } catch (e) {
      this.emit('error', e)
      throw e
    }
  }
}

const foregroundClient = new Client()
const backgroundClient = new Client()

export default {
  data() {
    return {
      config: null,
      loading: 0
    }
  },
  provide: {
    foregroundClient,
    backgroundClient
  },
  async created() {
    foregroundClient.on('request', () => {
      this.loading++
    })
    foregroundClient.on('response', () => {
      this.loading--
    })
    foregroundClient.on('error', (e) => {
      this.loading--
      this.$bvToast.toast('API call : ' + e.message, {solid: true, title: 'Error', variant: 'danger'})
    })
    backgroundClient.on('error', (e) => {
      this.$bvToast.toast('API call : ' + e.message, {solid: true, title: 'Error', variant: 'danger'})
    })

    this.config = await foregroundClient.getConfig()
  }
}
</script>

<style lang="scss">
  .loader {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    position: absolute;
    z-index: 1999;
    text-align: center;
    padding-top: 50vh;
    background-color: rgba(0, 0, 0, .1);
  }
  .login-form {
    width: 300px;
    margin: auto;
    margin-top: 10vh;
    /*margin-top: calc(50vh - 28px);
    transform: translateY(-50%);*/
  }
</style>
