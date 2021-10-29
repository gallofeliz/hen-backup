import Vue from 'vue'
import VueRouter from 'vue-router'
import Snapshots from '../views/snapshots.vue'
import Summary from '../views/summary.vue'
import Jobs from '../views/jobs.vue'
import Maintenance from '../views/maintenance.vue'

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
    component: Jobs,
    props: route => ({
      operation: route.query.operation,
      repository: route.query.repository,
      backup: route.query.backup
    })
  },
  {
    path: '/snapshots',
    name: 'snapshots',
    component: Snapshots
  },
  {
    path: '/maintenance',
    name: 'maintenance',
    component: Maintenance
  }
]

const router = new VueRouter({
  routes
})

export default router
