<template>
  <div id="app">

    <div v-if="loading > 0" class="loader"><img src="/1496.gif" /></div>

    <b-navbar toggleable="lg" type="dark" variant="info">
      <b-navbar-brand href="#">Hen-Backup WebUI</b-navbar-brand>

        <b-navbar-toggle target="nav-collapse"></b-navbar-toggle>

        <b-collapse id="nav-collapse" is-nav v-if="auth">
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
      <router-view v-if="auth"/>
      <div v-if="!auth">
        <form @submit="login()" class="login-form">



          <b-form-group
            label="Username:"
            label-for="input-1"
          >
            <b-form-input
              id="input-1"
              v-model="formLogin"
              required
            ></b-form-input>
          </b-form-group>

          <b-form-group
            label="Password:"
            label-for="input-2"
          >
            <b-form-input
              id="input-2"
              v-model="formPass"
              type="password"
              required
            ></b-form-input>
          </b-form-group>


          <b-button type="submit" variant="primary" block>Login</b-button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>

import { RequestManager, HTTPTransport, Client } from "@open-rpc/client-js";

const rM = new RequestManager([]);
const client = new Client(rM);

export default {
  data() {
    return {
      config: null,
      loading: 0,
      client,
      auth: false,
      formLogin: null,
      formPass: null
    }
  },
  provide: {
    client
  },
  methods: {
    async login(auth) {
      if (!auth) {
        auth = btoa(this.formLogin + ':' + this.formPass)
      }
      const transport = new HTTPTransport("http://localhost:8585", {
          headers: {
              'Authorization': 'Basic ' + auth
          }
      });
      rM.transports = [transport]
      try {
        this.config = await this.client.request({method: "get_config_summary", params: []})
        this.auth = true
        window.sessionStorage.setItem('auth', auth)
      } catch (e) {
        console.error(e)
      }
    }
  },
  async created() {

    ((parentRequest) => this.client.request = async (...args) => {
        this.loading++
        try {
          const response = await parentRequest(...args)
          this.loading--
          return response
        } catch (e) {
          this.loading--
          this.$bvToast.toast('Daemon call : ' + e.message, {solid: true, title: 'Error', variant: 'danger'})
          throw e
        }
    })(this.client.request.bind(this.client))

    if (window.sessionStorage.getItem('auth')) {
      this.login(window.sessionStorage.getItem('auth'))
    }
  },
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
