import { createReducer, on } from '@ngrx/store'
import type { Anomaly, AuditEntry, PlanDraft, PlanItem, TailingsDataset } from '../domain'
import { buildSnapshot, cloneItems, isClosed, latestPlanVersion, migratePlanSnapshots } from '../domain'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export interface PlanConflict {
  zone: string
  /** 草稿基于的版本 */
  baseVersion: number
  /** 分区当前最新版本（先发布者的版本） */
  currentVersion: number
  publishedBy: string
  publishedAt: string
  attemptedBy: string
}

export interface TailingsState {
  dataset: TailingsDataset
  drafts: Record<string, PlanDraft>
  selectedZone: string
  conflict: PlanConflict | null
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
}

const migratedSeed = migratePlanSnapshots(structuredClone(seedDataset))

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(migratedSeed),
  drafts: {},
  selectedZone: '主坝',
  conflict: null,
  loading: false,
  error: '',
  selectedAnomalyId: migratedSeed.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部'
}

let idSeed = 50
const audit = (entityId: string, action: string, operator: string, detail: string): AuditEntry => ({
  id: `AUD-${Date.now()}-${idSeed++}`, entityId, action, operator, detail, createdAt: new Date().toISOString()
})

const describeItems = (planItems: PlanItem[]): string =>
  planItems.map((item) => `${item.type}${item.frequency}/处置V${item.dispositionVersion}`).join('；')

const omitDraft = (drafts: Record<string, PlanDraft>, zone: string): Record<string, PlanDraft> => {
  const next = { ...drafts }
  delete next[zone]
  return next
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => {
    const migrated = migratePlanSnapshots(dataset)
    return { ...state, dataset: migrated, loading: false, conflict: null, selectedAnomalyId: migrated.anomalies[0]?.id ?? '' }
  }),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(TailingsActions.selectZone, (state, { zone }) => ({ ...state, selectedZone: zone, conflict: state.conflict?.zone === zone ? state.conflict : null })),

  on(TailingsActions.savePlanDraft, (state, { draft }) => {
    const current = latestPlanVersion(state.dataset.planVersions, draft.zone)
    if (!current) return state
    // 以最新版本为基准保存草稿；若已有更新版本发布，baseVersion 跟随最新版本，编辑器需重新确认
    const baseVersion = Math.max(draft.baseVersion, current.version)
    const next: PlanDraft = {
      ...draft,
      baseVersion,
      items: cloneItems(draft.items),
      updatedAt: new Date().toISOString()
    }
    return { ...state, drafts: { ...state.drafts, [draft.zone]: next }, conflict: null }
  }),

  on(TailingsActions.publishPlan, (state, { zone, publisher, baseVersion, note }) => {
    const draft = state.drafts[zone]
    if (!draft || !draft.items.length) return state
    const current = latestPlanVersion(state.dataset.planVersions, zone)
    if (!current) return state

    // 乐观并发：两人先后发布同一分区，晚到的人基于的版本已过期，必须重新确认，不能覆盖先发布的调整
    if (baseVersion < current.version) {
      const dataset = structuredClone(state.dataset)
      dataset.audit.unshift(audit(zone, '发布计划冲突', publisher, `计划草稿基于V${baseVersion}，但${current.publishedBy}已先发布V${current.version}，发布被阻止，等待重新确认`))
      return {
        ...state,
        dataset,
        conflict: { zone, baseVersion, currentVersion: current.version, publishedBy: current.publishedBy, publishedAt: current.publishedAt, attemptedBy: publisher }
      }
    }

    const dataset = structuredClone(state.dataset)
    const nextVersion = current.version + 1
    dataset.planVersions.push({
      id: `MP-${zone}-V${nextVersion}`,
      zone,
      version: nextVersion,
      items: cloneItems(draft.items),
      remark: note || draft.remark,
      publishedBy: publisher,
      publishedAt: new Date().toISOString()
    })
    dataset.audit.unshift(audit(zone, '发布监测计划', publisher, `分区「${zone}」V${nextVersion}发布（基于V${baseVersion}）：${describeItems(draft.items)}${note ? `；说明：${note}` : ''}`))
    return { ...state, dataset, drafts: omitDraft(state.drafts, zone), conflict: null }
  }),

  on(TailingsActions.confirmPublishPlan, (state, { zone, publisher, note }) => {
    const draft = state.drafts[zone]
    const current = latestPlanVersion(state.dataset.planVersions, zone)
    if (!draft || !current) return state

    const dataset = structuredClone(state.dataset)
    const nextVersion = current.version + 1
    dataset.planVersions.push({
      id: `MP-${zone}-V${nextVersion}`,
      zone,
      version: nextVersion,
      items: cloneItems(draft.items),
      remark: note || draft.remark,
      publishedBy: publisher,
      publishedAt: new Date().toISOString()
    })
    dataset.audit.unshift(audit(zone, '确认后发布监测计划', publisher, `已查看先发布的V${current.version}并重新确认，分区「${zone}」V${nextVersion}发布：${describeItems(draft.items)}；先发布版本V${current.version}保留未覆盖`))
    return { ...state, dataset, drafts: omitDraft(state.drafts, zone), conflict: null }
  }),

  on(TailingsActions.externalPublishPlan, (state, { zone, publisher, note }) => {
    const current = latestPlanVersion(state.dataset.planVersions, zone)
    if (!current) return state
    const dataset = structuredClone(state.dataset)
    const nextVersion = current.version + 1
    // 抢先发布者在最新版本上做独立加密调整，当前用户草稿保留不动，随后其发布会命中乐观锁
    dataset.planVersions.push({
      id: `MP-${zone}-V${nextVersion}`,
      zone,
      version: nextVersion,
      items: cloneItems(current.items).map((item) => ({ ...item, dispositionVersion: Math.max(item.dispositionVersion, current.version) })),
      remark: note,
      publishedBy: publisher,
      publishedAt: new Date().toISOString()
    })
    dataset.audit.unshift(audit(zone, '发布监测计划', publisher, `${publisher}抢先发布分区「${zone}」V${nextVersion}（基于V${current.version}），其他在编草稿基准已过期：${describeItems(current.items)}`))
    return { ...state, dataset }
  }),

  on(TailingsActions.enterFieldReview, (state, { anomalyId, inspector }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly) || anomaly.planSnapshot) return state
    const point = dataset.points.find((value) => value.id === anomaly.pointId)
    const plan = point ? latestPlanVersion(dataset.planVersions, point.zone) : undefined
    if (!plan) return state

    // 进入现场复核：冻结当时的监测类型、频率和处置版本
    anomaly.planSnapshot = buildSnapshot(plan, anomaly.triggerReadingId, 'pinned', new Date().toISOString())
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '进入现场复核', inspector, `冻结计划快照：${plan.zone}监测计划 V${plan.version}（${describeItems(plan.items)}），后续复测与关闭均按此版本执行`))
    return { ...state, dataset }
  }),

  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly) || !review.observed || !review.evidence || !review.reassessment) return state
    // 未冻结计划快照（未进入现场复核）不允许提交复核
    if (!anomaly.planSnapshot) return state
    anomaly.fieldReviews.unshift({ ...review, version: anomaly.fieldReviews.length + 1 })
    anomaly.status = '原因调查中'
    anomaly.version += 1
    const snapshotText = `按${anomaly.planSnapshot.zone}监测计划 V${anomaly.planSnapshot.planVersion}复核`
    dataset.audit.unshift(audit(anomalyId, '提交现场复核', review.inspector, `${snapshotText}：${review.reassessment}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly) || !opinion.content) return state
    anomaly.opinions.unshift(opinion)
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '补充专业意见', opinion.specialist, `${opinion.conclusion}：${opinion.content}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly) || !plan.owner || !plan.deadline || !plan.conditions) return state
    anomaly.plan = { ...plan, approvedBy: '', approvedAt: '' }
    anomaly.status = '待负责人审批'
    anomaly.version += 1
    const snapshotText = anomaly.planSnapshot ? `；计划依据仍为 V${anomaly.planSnapshot.planVersion}` : ''
    dataset.audit.unshift(audit(anomalyId, '提交处置方案', '当前用户', `${plan.action}，责任方${plan.owner}${snapshotText}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly)) return state
    if (anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) return state
    anomaly.plan.approvedBy = approver
    anomaly.plan.approvedAt = new Date().toISOString()
    anomaly.version += 1
    const snapshotText = anomaly.planSnapshot ? `（按监测计划 V${anomaly.planSnapshot.planVersion}）` : ''
    dataset.audit.unshift(audit(anomalyId, '审批处置方案', approver, `${note || '同意执行'}${snapshotText}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly) || !anomaly.plan.approvedBy || !anomaly.fieldReviews.length || !note.trim()) return state
    anomaly.status = '已关闭'
    anomaly.closedAt = new Date().toISOString()
    anomaly.version += 1
    const snapshot = anomaly.planSnapshot
    const snapshotText = snapshot ? `；关闭依据${snapshot.zone}监测计划 V${snapshot.planVersion}，快照不再改写` : ''
    dataset.audit.unshift(audit(anomalyId, '关闭异常', anomaly.plan.approvedBy, `${note}${snapshotText}`))
    return { ...state, dataset }
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || isClosed(anomaly)) return state
    anomaly.plan.emergencyLinked = true
    anomaly.status = '应急联动'
    anomaly.version += 1
    dataset.audit.unshift(audit(anomalyId, '启动应急联动', '值班负责人', note))
    return { ...state, dataset }
  }),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({
    ...initialTailingsState,
    dataset: structuredClone(migratedSeed),
    drafts: {},
    conflict: null,
    selectedAnomalyId: migratedSeed.anomalies[0].id
  }))
)
