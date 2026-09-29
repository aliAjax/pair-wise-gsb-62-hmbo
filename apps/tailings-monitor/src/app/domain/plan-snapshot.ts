import type {
  Anomaly,
  AnomalyCorrespondence,
  MonitoringPlan,
  MonitoringPlanItem,
  MonitoringType,
  PlanSnapshot,
  TailingsDataset
} from './models'

/** 取某分区当前已发布的最新版本计划 */
export function latestPublishedPlan(plans: MonitoringPlan[], zone: string): MonitoringPlan | null {
  return plans
    .filter((plan) => plan.zone === zone && plan.status === '已发布')
    .sort((a, b) => b.version - a.version)[0] ?? null
}

export function draftPlanOf(plans: MonitoringPlan[], zone: string): MonitoringPlan | null {
  return plans.find((plan) => plan.zone === zone && plan.status === '草稿') ?? null
}

export function zoneOfPoint(dataset: TailingsDataset, pointId: string): string {
  return dataset.points.find((point) => point.id === pointId)?.zone ?? ''
}

function planItemFor(plan: MonitoringPlan, type: MonitoringType): MonitoringPlanItem {
  return plan.items.find((item) => item.type === type) ?? plan.items[0]
}

/** 依据已发布计划为指定测点生成冻结快照 */
export function buildSnapshot(plan: MonitoringPlan, type: MonitoringType, frozenAt: string, source: PlanSnapshot['source'] = '发布版'): PlanSnapshot {
  const item = planItemFor(plan, type)
  return {
    planId: plan.id,
    zone: plan.zone,
    version: plan.version,
    type: item.type,
    frequency: item.frequency,
    dispositionBasis: item.dispositionBasis,
    dispositionVersion: plan.version,
    publishedBy: plan.publishedBy,
    publishedAt: plan.publishedAt,
    source,
    backfilledAt: source === '升级补齐' ? frozenAt : '',
    frozenAt
  }
}

/** 计划版本—原始读数—异常状态—审计时间的对应关系，界面与审阅包共用 */
export function buildCorrespondence(dataset: TailingsDataset): AnomalyCorrespondence[] {
  return dataset.anomalies.map((anomaly) => {
    const point = dataset.points.find((value) => value.id === anomaly.pointId)
    const reading = dataset.readings.find((value) => value.id === anomaly.triggerReadingId)
    const lastAudit = dataset.audit.find((entry) => entry.entityId === anomaly.id)
    const snapshot = anomaly.planSnapshot
    return {
      anomalyId: anomaly.id,
      title: anomaly.title,
      pointId: anomaly.pointId,
      zone: point?.zone ?? '',
      monitoringType: point?.type ?? snapshot?.type ?? '—',
      planVersion: snapshot ? `${snapshot.zone} V${snapshot.version}` : '未关联（升级前记录）',
      planFrequency: snapshot?.frequency ?? '—',
      dispositionVersion: snapshot ? `V${snapshot.dispositionVersion}` : '—',
      snapshotSource: snapshot?.source ?? '—',
      triggerReadingId: anomaly.triggerReadingId,
      triggerValue: reading ? `${reading.value} ${reading.unit}（${reading.quality}）` : anomaly.observedValue,
      status: anomaly.status,
      openedAt: anomaly.openedAt,
      closedAt: anomaly.closedAt || '—',
      lastAuditAt: lastAudit?.createdAt ?? '—',
      lastAuditAction: lastAudit?.action ?? '—'
    }
  })
}

export function isClosed(anomaly: Anomaly): boolean {
  return anomaly.status === '已关闭'
}
