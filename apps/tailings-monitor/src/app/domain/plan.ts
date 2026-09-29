import type { Anomaly, MonitoringPlanVersion, PlanItem, PlanSnapshot, TailingsDataset } from './models'

/** 系统升级切换时间：此前打开且没有计划快照的异常按打开时最新版本补齐 */
export const PLAN_SNAPSHOT_MIGRATED_AT = '2026-09-29T08:30:00'

export const cloneItems = (items: PlanItem[]): PlanItem[] => items.map((item) => ({ ...item }))

export const planVersionsOf = (versions: MonitoringPlanVersion[], zone: string): MonitoringPlanVersion[] =>
  versions.filter((item) => item.zone === zone).sort((a, b) => a.version - b.version)

export const latestPlanVersion = (versions: MonitoringPlanVersion[], zone: string): MonitoringPlanVersion | undefined =>
  planVersionsOf(versions, zone).at(-1)

/** 取某分区在指定时间（含）之前最新的已发布计划版本；没有更早版本时回退到最早版本 */
export const latestPlanVersionAt = (
  versions: MonitoringPlanVersion[],
  zone: string,
  atISO: string
): MonitoringPlanVersion | undefined => {
  const list = planVersionsOf(versions, zone)
  const applicable = list.filter((item) => item.publishedAt <= atISO)
  return applicable.at(-1) ?? list[0]
}

export const buildSnapshot = (
  plan: MonitoringPlanVersion,
  triggerReadingId: string,
  source: PlanSnapshot['source'],
  pinnedAt: string
): PlanSnapshot => ({
  zone: plan.zone,
  planId: plan.id,
  planVersion: plan.version,
  items: cloneItems(plan.items),
  triggerReadingId,
  source,
  pinnedAt,
  publishedAt: plan.publishedAt,
  publishedBy: plan.publishedBy
})

/**
 * 升级迁移：升级前已打开、没有计划快照的异常，按打开时最新已发布版本补齐。
 * 幂等——已有快照或升级后新开的异常不动；只追加一次补齐审计。
 */
export function migratePlanSnapshots(input: TailingsDataset): TailingsDataset {
  const dataset: TailingsDataset = structuredClone(input)
  const appendedAudit = [...dataset.audit]

  for (const anomaly of dataset.anomalies) {
    if (anomaly.planSnapshot || anomaly.openedAt > PLAN_SNAPSHOT_MIGRATED_AT) continue
    const point = dataset.points.find((value) => value.id === anomaly.pointId)
    const plan = point ? latestPlanVersionAt(dataset.planVersions, point.zone, anomaly.openedAt) : undefined
    if (!plan) continue
    anomaly.planSnapshot = buildSnapshot(plan, anomaly.triggerReadingId, 'backfilled', PLAN_SNAPSHOT_MIGRATED_AT)
    appendedAudit.push({
      id: `AUD-BACKFILL-${anomaly.id}`,
      entityId: anomaly.id,
      action: '补齐计划快照',
      operator: '系统升级迁移',
      detail: `升级前异常缺少计划快照，按打开时（${anomaly.openedAt.replace('T', ' ').slice(0, 16)}）最新版本补齐：${plan.zone}监测计划 V${plan.version}（${plan.publishedBy} 发布于 ${plan.publishedAt.replace('T', ' ').slice(0, 16)}），后续复测与关闭继续认该版本`,
      createdAt: PLAN_SNAPSHOT_MIGRATED_AT
    })
  }

  // 新事件在 reducer 中以 unshift 写入，统一按时间倒序后保证展示一致
  dataset.audit = appendedAudit.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return dataset
}

export const isClosed = (anomaly: Anomaly): boolean => anomaly.status === '已关闭'

/** 异常对应的触发原始读数 */
export const triggerReadingOf = (dataset: TailingsDataset, anomaly: Anomaly) =>
  dataset.readings.find((reading) => reading.id === anomaly.triggerReadingId)

/** 异常的审计时间线（倒序） */
export const auditOf = (dataset: TailingsDataset, anomaly: Anomaly) =>
  dataset.audit
    .filter((entry) => entry.entityId === anomaly.id || entry.entityId === anomaly.triggerReadingId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
