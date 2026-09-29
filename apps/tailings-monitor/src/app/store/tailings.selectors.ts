import { createFeatureSelector, createSelector } from '@ngrx/store'
import { buildCorrespondence, draftPlanOf, latestPublishedPlan } from '../domain/plan-snapshot'
import type { TailingsState } from './tailings.reducer'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')
export const selectDataset = createSelector(selectTailings, (state) => state.dataset)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectPlans = createSelector(selectDataset, (dataset) => dataset.plans)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectSelectedAnomalyId = createSelector(selectTailings, (state) => state.selectedAnomalyId)
export const selectSelectedAnomaly = createSelector(selectTailings, (state) => state.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? state.dataset.anomalies[0])
export const selectSelectedPlanZone = createSelector(selectTailings, (state) => state.selectedPlanZone)
export const selectPublishConflict = createSelector(selectTailings, (state) => state.publishConflict)
export const selectZones = createSelector(selectDataset, (dataset) => [...new Set(dataset.points.map((point) => point.zone))])
export const selectZonePlanHistory = createSelector(selectPlans, selectSelectedPlanZone, (plans, zone) =>
  plans.filter((plan) => plan.zone === zone).sort((a, b) => {
    if (a.status === '草稿') return -1
    if (b.status === '草稿') return 1
    return b.version - a.version
  })
)
export const selectZoneDraft = createSelector(selectPlans, selectSelectedPlanZone, (plans, zone) => draftPlanOf(plans, zone))
export const selectZoneLatestPlan = createSelector(selectPlans, selectSelectedPlanZone, (plans, zone) => latestPublishedPlan(plans, zone))
export const selectCorrespondence = createSelector(selectDataset, (dataset) => buildCorrespondence(dataset))
export const selectFilteredAnomalies = createSelector(selectTailings, (state) => state.dataset.anomalies.filter((item) => {
  const point = state.dataset.points.find((value) => value.id === item.pointId)
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))
