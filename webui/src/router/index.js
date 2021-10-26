import Vue from 'vue'
import VueRouter from 'vue-router'
import Snapshots from '../views/snapshots.vue'
import Summary from '../views/summary.vue'
import Jobs from '../views/jobs.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Summary',
    component: Summary
  },
  {
    path: '/jobs',
    name: 'jobs',
    component: Jobs
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
