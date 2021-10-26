<template>
  <div id="app">

    <div v-if="loading > 0" class="loader"><img src="/1496.gif" /></div>

    <b-navbar toggleable="lg" type="dark" variant="info">
      <b-navbar-brand href="#">Hen-Backup WebUI</b-navbar-brand>

        <b-navbar-toggle target="nav-collapse"></b-navbar-toggle>

        <b-collapse id="nav-collapse" is-nav>
          <b-navbar-nav>
            <b-nav-item exact-active-class="active" to="/">Summary</b-nav-item>
            <b-nav-item exact-active-class="active" to="/snapshots">Explore</b-nav-item>
            <b-nav-item exact-active-class="active" to="/search">Search</b-nav-item>
            <b-nav-item exact-active-class="active" to="/jobs">Jobs</b-nav-item>
            <b-nav-item exact-active-class="active" to="/maintenance">Maintenance</b-nav-item>
          </b-navbar-nav>

          <b-navbar-nav class="ml-auto">

          <b-nav-text right v-if="config">
            Device {{config.hostname}}
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
    return this.call('/snapshots/'+encodeURI(repository)+'/'+encodeURI(snapshot))
  }
  getDownloadSnapshotUrl(repository, snapshot, path, format, type) {
    return '/api/snapshots/'+encodeURI(repository)+'/'+encodeURI(snapshot)+'/content?' + new URLSearchParams({type, path, format}).toString()
  }
  async getJobs() {
    return this.call('/jobs')
  }
  async getSummary() {
    return this.call('/summary')
  }
  async call(url, json=true) {
    return this.handleEvents(async () => {
      const response = await fetch('/api' + url)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      return json ? response.json() : undefined
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
