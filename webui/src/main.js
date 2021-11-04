import '@babel/polyfill'
import 'mutationobserver-shim'
import Vue from 'vue'
import './plugins/bootstrap-vue'
import App from './App.vue'
import router from './router'
import * as prettyBytes from 'pretty-bytes'

Vue.filter('prettyBytes', function (num) {
  return prettyBytes(num, {binary: true});
});

Vue.config.productionTip = false

new Vue({
  router,
  render: h => h(App)
}).$mount('#app')

