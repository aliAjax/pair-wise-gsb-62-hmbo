import { Routes } from '@angular/router'

export const appRoutes: Routes = [
  { path: '', loadComponent: () => import('./pages/dashboard-page.component').then((module) => module.DashboardPageComponent) },
  { path: 'monitoring', loadComponent: () => import('./pages/monitoring-page.component').then((module) => module.MonitoringPageComponent) },
  { path: 'anomalies', loadComponent: () => import('./pages/anomaly-page.component').then((module) => module.AnomalyPageComponent) },
  { path: 'plans', loadComponent: () => import('./pages/plans-page.component').then((module) => module.PlansPageComponent) },
  { path: 'audit', loadComponent: () => import('./pages/audit-page.component').then((module) => module.AuditPageComponent) },
  { path: '**', redirectTo: '' }
]
