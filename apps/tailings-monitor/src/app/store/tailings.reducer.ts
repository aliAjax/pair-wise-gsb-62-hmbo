import { createReducer, on } from '@ngrx/store'
import type { Anomaly, AuditEntry, MonitoringPlan, PlanSnapshot, TailingsDataset } from '../domain'
import { buildSnapshot, latestPublishedPlan, zoneOfPoint } from '../domain/plan-snapshot'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export interface PublishConflict {
  zone: string
  planId: string
  draftBasedOnVersion: number
  latestVersion: number
  latestPublishedBy: string
  latestPublishedAt: string
  latestReason: string
}

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  selectedPlanZone: string
  publishConflict: PublishConflict | null
  keyword: string
  status: Anomaly['status'] | '全部'
}

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  selectedPlanZone: seedDataset.points[0]?.zone ?? '主坝',
  publishConflict: null,
  keyword: '',
  status: '全部'
}

let idSeed = 50
const audit = (entityId: string, action: string, operator: string, detail: string): AuditEntry => ({
  id: `AUD-${Date.now()}-${idSeed++}`, entityId, action, operator, detail, createdAt: new Date().toISOString()
})

const nextPlanId = (zone: string, version: number): string =>
  `MP-${zone}-V${version}-${Date.now().toString(36)}`

/** 升级前打开、无快照的异常，在“打开”（选中）时按当时最新已发布版补齐；已关闭记录不动 */
function backfillIfNeeded(dataset: TailingsDataset, anomalyId: string): AuditEntry | null {
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly || anomaly.planSnapshot || anomaly.status === '已关闭') return null
  const zone = zoneOfPoint(dataset, anomaly.pointId)
  const point = dataset.points.find((value) => value.id === anomaly.pointId)
  const plan = latestPublishedPlan(dataset.plans, zone)
  if (!plan || !point) return null
  const now = new Date().toISOString()
  const snapshot: PlanSnapshot = buildSnapshot(plan, point.type, now, '升级补齐')
  anomaly.planSnapshot = snapshot
  return audit(
    anomalyId,
    '补齐计划快照',
    '系统',
    `升级前异常按打开时最新版本补齐：${zone} V${plan.version}（${point.type} ${snapshot.frequency}，处置版本V${plan.version}），后续复测与关闭均认此版本`
  )
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => {
    const firstId = dataset.anomalies[0]?.id ?? ''
    const added = firstId ? backfillIfNeeded(dataset, firstId) : null
    if (added) dataset.audit.unshift(added)
    return {
      ...state,
      dataset,
      loading: false,
      selectedAnomalyId: firstId,
      selectedPlanZone: dataset.points[0]?.zone ?? state.selectedPlanZone,
      publishConflict: null
    }
  }),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),

  // ---- 监测计划：草稿与发布（乐观并发，晚到发布必须看到冲突）----
  on(TailingsActions.selectPlanZone, (state, { zone }) => ({ ...state, selectedPlanZone: zone, publishConflict: null })),
  on(TailingsActions.savePlanDraft, (state, { zone, changeScope, reason, items, operator }) => {
    if (!reason.trim() || items.some((item) => !item.frequency.trim() || !item.dispositionBasis.trim())) return state
    const dataset = structuredClone(state.dataset)
    const now = new Date().toISOString()
    const existing = dataset.plans.find((plan) => plan.zone === zone && plan.status === '草稿')
    if (existing) {
      // 基于版本不随保存移动：他人在此期间发布新版本，仍要在发布时暴露冲突
      existing.changeScope = changeScope
      existing.reason = reason
      existing.items = structuredClone(items)
      existing.draftedBy = operator
      existing.draftedAt = now
    } else {
      const latest = latestPublishedPlan(dataset.plans, zone)
      dataset.plans.push({
        id: `MP-${zone}-DRAFT-${Date.now().toString(36)}`,
        zone,
        version: 0,
        status: '草稿',
        changeScope,
        reason,
        items: structuredClone(items),
        basedOnVersion: latest?.version ?? 0,
        draftedBy: operator,
        draftedAt: now,
        publishedBy: '',
        publishedAt: ''
      })
    }
    dataset.audit.unshift(audit(existing?.id ?? `${zone}-草稿`, '保存计划草稿', operator, `${zone}草稿已更新（${changeScope}）：${reason}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.publishPlan, (state, { planId, publisher }) => {
    const dataset = structuredClone(state.dataset)
    const draft = dataset.plans.find((plan) => plan.id === planId && plan.status === '草稿')
    if (!draft) return state
    const latest = latestPublishedPlan(dataset.plans, draft.zone)
    const latestVersion = latest?.version ?? 0
    if (latestVersion > draft.basedOnVersion) {
      // 晚到的发布：拦截并要求重新确认，绝不盖掉先发布的调整
      dataset.audit.unshift(audit(
        draft.id,
        '发布冲突拦截',
        publisher,
        `草稿基于${draft.zone} V${draft.basedOnVersion}，但 V${latestVersion} 已由${latest?.publishedBy ?? ''}于${latest?.publishedAt ?? ''}先发布；发布被拦截，需重新确认`
      ))
      return {
        ...state,
        dataset,
        publishConflict: {
          zone: draft.zone,
          planId: draft.id,
          draftBasedOnVersion: draft.basedOnVersion,
          latestVersion,
          latestPublishedBy: latest?.publishedBy ?? '',
          latestPublishedAt: latest?.publishedAt ?? '',
          latestReason: latest?.reason ?? ''
        }
      }
    }
    return publishDraft(state, dataset, draft, latestVersion + 1, publisher, '')
  }),
  on(TailingsActions.confirmPublishPlan, (state, { planId, publisher }) => {
    const dataset = structuredClone(state.dataset)
    const draft = dataset.plans.find((plan) => plan.id === planId && plan.status === '草稿')
    if (!draft || !state.publishConflict) return { ...state, publishConflict: null }
    const latest = latestPublishedPlan(dataset.plans, draft.zone)
    const newVersion = (latest?.version ?? 0) + 1
    return publishDraft(
      state,
      dataset,
      draft,
      newVersion,
      publisher,
      `冲突后重新确认发布：草稿基于V${draft.basedOnVersion}，在先发布的V${state.publishConflict.latestVersion}之上生成V${newVersion}，未覆盖任何已发布版本`
    )
  }),
  on(TailingsActions.discardPlanDraft, (state, { zone }) => {
    const dataset = structuredClone(state.dataset)
    const draft = dataset.plans.find((plan) => plan.zone === zone && plan.status === '草稿')
    if (!draft) return { ...state, publishConflict: null }
    dataset.plans = dataset.plans.filter((plan) => plan.id !== draft.id)
    dataset.audit.unshift(audit(draft.id, '作废计划草稿', draft.draftedBy, `${zone}草稿作废，未影响任何已发布版本`))
    return { ...state, dataset, publishConflict: null }
  }),
  on(TailingsActions.dismissPublishConflict, (state) => ({ ...state, publishConflict: null })),

  // ---- 异常处置：现场复核冻结快照，复测/关闭认这版，已关闭不再改写 ----
  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭' || !review.observed || !review.evidence || !review.reassessment) return state
    const point = dataset.points.find((value) => value.id === anomaly.pointId)
    const plan = point ? latestPublishedPlan(dataset.plans, point.zone) : null
    if (!point || !plan) return state
    if (!anomaly.planSnapshot) {
      // 进入现场复核：保存当时的监测类型、频率和处置版本
      anomaly.planSnapshot = buildSnapshot(plan, point.type, new Date().toISOString(), '发布版')
    }
    anomaly.fieldReviews.unshift({ ...review, version: anomaly.fieldReviews.length + 1 })
    anomaly.status = '原因调查中'
    anomaly.version += 1
    const snapshot = anomaly.planSnapshot
    dataset.audit.unshift(audit(
      anomalyId,
      '提交现场复核',
      review.inspector,
      `冻结监测计划 ${snapshot.zone} V${snapshot.version}（${snapshot.type} ${snapshot.frequency}，处置版本V${snapshot.dispositionVersion}）；${review.reassessment}`
    ))
    return { ...state, dataset }
  }),
  on(TailingsActions.submitRetest, (state, { anomalyId, retest }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭' || !anomaly.planSnapshot || !retest.conclusion.trim()) return state
    const snapshot = anomaly.planSnapshot
    // 复测继续认快照版：频率与处置版本不随后续计划发布而变
    anomaly.retests.unshift({
      ...retest,
      id: `RT-${Date.now()}`,
      planVersion: snapshot.version,
      frequency: snapshot.frequency,
      measuredAt: retest.measuredAt || new Date().toISOString()
    })
    anomaly.version += 1
    dataset.audit.unshift(audit(
      anomalyId,
      '提交复测',
      retest.inspector,
      `按冻结计划 ${snapshot.zone} V${snapshot.version}（${snapshot.frequency}）复测：${retest.value}${retest.unit}；${retest.conclusion}`
    ))
    return { ...state, dataset }
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭' || !opinion.content) return state
    anomaly.opinions.unshift(opinion)
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '补充专业意见', opinion.specialist, `${opinion.conclusion}：${opinion.content}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭' || !plan.owner || !plan.deadline || !plan.conditions) return state
    anomaly.plan = { ...plan, approvedBy: '', approvedAt: '' }
    anomaly.status = '待负责人审批'
    anomaly.version += 1
    const versionText = anomaly.planSnapshot ? `（依据${anomaly.planSnapshot.zone} V${anomaly.planSnapshot.dispositionVersion}）` : ''
    dataset.audit.unshift(audit(anomalyId, '提交处置方案', '当前用户', `${plan.action}，责任方${plan.owner}${versionText}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭') return state
    if (anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) return state
    anomaly.plan.approvedBy = approver
    anomaly.plan.approvedAt = new Date().toISOString()
    anomaly.version += 1
    const versionText = anomaly.planSnapshot ? `；计划版本${anomaly.planSnapshot.zone} V${anomaly.planSnapshot.dispositionVersion}` : ''
    dataset.audit.unshift(audit(anomalyId, '审批处置方案', approver, `${note || '同意执行'}${versionText}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭') return state
    if (!anomaly.plan.approvedBy || !anomaly.fieldReviews.length || !anomaly.retests.length || !note.trim()) return state
    anomaly.status = '已关闭'
    anomaly.closedAt = new Date().toISOString()
    anomaly.version += 1
    const versionText = anomaly.planSnapshot
      ? `关闭时确认处置版本 ${anomaly.planSnapshot.zone} V${anomaly.planSnapshot.dispositionVersion}（${anomaly.planSnapshot.frequency}），快照与原始读数不再改写；`
      : ''
    dataset.audit.unshift(audit(anomalyId, '关闭异常', anomaly.plan.approvedBy, `${versionText}${note}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || anomaly.status === '已关闭') return state
    anomaly.plan.emergencyLinked = true
    anomaly.status = '应急联动'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '启动应急联动', '值班负责人', note))
    return { ...state, dataset }
  }),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => {
    const dataset = structuredClone(state.dataset)
    const added = backfillIfNeeded(dataset, anomalyId)
    if (added) dataset.audit.unshift(added)
    return { ...state, dataset, selectedAnomalyId: anomalyId }
  }),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({
    ...initialTailingsState,
    dataset: structuredClone(seedDataset),
    selectedAnomalyId: seedDataset.anomalies[0].id,
    selectedPlanZone: seedDataset.points[0].zone
  }))
)

function publishDraft(
  state: TailingsState,
  dataset: TailingsDataset,
  draft: MonitoringPlan,
  newVersion: number,
  publisher: string,
  conflictNote: string
): TailingsState {
  const publishedAt = new Date().toISOString()
  const published: MonitoringPlan = {
    ...structuredClone(draft),
    id: nextPlanId(draft.zone, newVersion),
    version: newVersion,
    status: '已发布',
    basedOnVersion: draft.basedOnVersion,
    publishedBy: publisher,
    publishedAt
  }
  dataset.plans = dataset.plans.filter((plan) => plan.id !== draft.id)
  dataset.plans.push(published)
  dataset.audit.unshift(audit(
    published.id,
    '发布监测计划',
    publisher,
    `${draft.zone} V${newVersion}（${draft.changeScope}）已发布：${draft.items.map((item) => `${item.type}${item.frequency}`).join('、')}。${conflictNote}`
  ))
  return { ...state, dataset, publishConflict: null }
}
