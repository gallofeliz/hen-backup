import Vue from 'vue'
import VueRouter from 'vue-router'
import Snapshots from '../views/snapshots.vue'
import Status from '../views/status.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'status',
    component: Status
  },
  {
    path: '/snapshots',
    name: 'snapshots',
    component: Snapshots
  }
]

const router = new VueRouter({
  routes
})

export default router
