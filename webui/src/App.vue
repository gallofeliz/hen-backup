<template>
  <div id="app">

    <div v-if="loading > 0" class="loader"><img src="/1496.gif" /></div>

    <b-navbar toggleable="lg" type="dark" variant="info">
      <b-navbar-brand href="#">Hen-Backup WebUI</b-navbar-brand>

        <b-navbar-toggle target="nav-collapse"></b-navbar-toggle>

        <b-collapse id="nav-collapse" is-nav>
          <b-navbar-nav>
            <b-nav-item to="/">Status</b-nav-item>
            <b-nav-item to="/snapshots">Explore</b-nav-item>
            <b-nav-item to="/search">Search</b-nav-item>
            <b-nav-item to="/maintenance">Maintenance</b-nav-item>
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

class Client extends EventEmitter {
  getConfig() {
    return this.handleEvents(async () => (await fetch('/api/config')).json())
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

const client = new Client()

export default {
  data() {
    return {
      config: null,
      loading: 0,
      client
    }
  },
  provide: {
    client
  },
  async created() {
    client.on('request', () => {
      this.loading++
    })
    client.on('response', () => {
      this.loading--
    })
    client.on('error', (e) => {
      this.loading--
      this.$bvToast.toast('API call : ' + e.message, {solid: true, title: 'Error', variant: 'danger'})
    })

    this.config = await client.getConfig()
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
