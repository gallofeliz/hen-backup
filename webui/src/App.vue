<template>
  <div id="app">

    <div v-if="loading > 0" class="loader"><img src="/1496.gif" /></div>

    <b-navbar toggleable="lg" type="dark" variant="info">
      <b-navbar-brand href="#">Hen-Backup WebUI</b-navbar-brand>

      <b-navbar-toggle target="nav-collapse"></b-navbar-toggle>

      <b-collapse id="nav-collapse" is-nav>
        <b-navbar-nav>
          <b-nav-item to="/">Status</b-nav-item>
          <b-nav-item to="/snapshots">Snapshots</b-nav-item>
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
export default {
  inject: ['client'],
  data() {
    return {
      config: null,
      loading: 0
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
        }
    })(this.client.request.bind(this.client))

    this.config = await this.client.request({method: "get_config_summary", params: []})
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
</style>
