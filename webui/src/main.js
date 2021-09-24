import '@babel/polyfill'
import 'mutationobserver-shim'
import Vue from 'vue'
import './plugins/bootstrap-vue'
import App from './App.vue'
import router from './router'
import { RequestManager, HTTPTransport, Client } from "@open-rpc/client-js";

Vue.config.productionTip = false

const transport = new HTTPTransport("http://localhost:8585");
const client = new Client(new RequestManager([transport]));

new Vue({
  router,
  render: h => h(App),
  provide: {
      client
  }
}).$mount('#app')
