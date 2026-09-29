import { createFeatureSelector, createSelector } from '@ngrx/store'
import { planVersionsOf } from '../domain'
import type { TailingsState } from './tailings.reducer'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')
export const selectDataset = createSelector(selectTailings, (state) => state.dataset)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectPlanVersions = createSelector(selectDataset, (dataset) => dataset.planVersions)
export const selectDrafts = createSelector(selectTailings, (state) => state.drafts)
export const selectSelectedZone = createSelector(selectTailings, (state) => state.selectedZone)
export const selectPlanConflict = createSelector(selectTailings, (state) => state.conflict)
export const selectZonePlanVersions = createSelector(selectPlanVersions, selectSelectedZone, (versions, zone) => planVersionsOf(versions, zone))
export const selectSelectedAnomaly = createSelector(selectTailings, (state) => state.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? state.dataset.anomalies[0])
export const selectFilteredAnomalies = createSelector(selectTailings, (state) => state.dataset.anomalies.filter((item) => {
  const point = state.dataset.points.find((value) => value.id === item.pointId)
  const snapshot = item.planSnapshot ? `V${item.planSnapshot.planVersion}` : ''
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''} ${snapshot}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))
