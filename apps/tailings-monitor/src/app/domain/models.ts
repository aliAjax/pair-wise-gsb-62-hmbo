export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'
export type PlanStatus = '草稿' | '已发布' | '已作废'
export type PlanChangeScope = '日常' | '汛期前调整'
export type SnapshotSource = '发布版' | '升级补齐'

export interface MonitoringPoint {
  id: string
  name: string
  zone: string
  type: MonitoringType
  longitude: number
  latitude: number
  status: PointStatus
  currentValue: number
  unit: string
  thresholdId: string
  lastInspectionAt: string
}

export interface Threshold {
  id: string
  type: MonitoringType
  warning: number
  alarm: number
  changeRate: number
  unit: string
  enabled: boolean
  version: number
}

export interface RawReading {
  id: string
  pointId: string
  value: number
  unit: string
  capturedAt: string
  deviceId: string
  quality: '有效' | '可疑' | '无效'
}

/** 分区监测计划中的单个监测项：类型、频率与处置依据都随计划版本固定 */
export interface MonitoringPlanItem {
  type: MonitoringType
  frequency: string
  dispositionBasis: string
}

/**
 * 监测计划版本（按分区独立编号）。
 * 草稿只有一份；负责人发布后生成新的“已发布”版本，旧版本永不改写。
 * publishedAt 非空时表示该版本已发布，异常快照只能引用已发布版本。
 */
export interface MonitoringPlan {
  id: string
  zone: string
  version: number
  status: PlanStatus
  changeScope: PlanChangeScope
  reason: string
  items: MonitoringPlanItem[]
  /** 草稿基于的已发布版本号；发布时用于乐观并发冲突判定 */
  basedOnVersion: number
  draftedBy: string
  draftedAt: string
  publishedBy: string
  publishedAt: string
}

/** 异常进入现场复核时冻结的计划快照，复测与关闭全程认这一版 */
export interface PlanSnapshot {
  planId: string
  zone: string
  version: number
  type: MonitoringType
  frequency: string
  dispositionBasis: string
  /** 处置版本 = 计划版本号，发布即不可变 */
  dispositionVersion: number
  publishedBy: string
  publishedAt: string
  /** 升级补齐的老异常标记来源，界面与审阅包据此区分 */
  source: SnapshotSource
  backfilledAt: string
  frozenAt: string
}

export interface ExpertOpinion {
  id: string
  specialist: string
  discipline: '坝体' | '水文' | '岩土' | '应急'
  content: string
  conclusion: '支持结论' | '提出异议' | '补充证据'
  createdAt: string
}

export interface FieldReview {
  id: string
  inspector: string
  arrivedAt: string
  observed: string
  evidence: string
  reassessment: string
  version: number
}

/** 复测记录按异常冻结的计划版本执行 */
export interface RetestRecord {
  id: string
  planVersion: number
  frequency: string
  value: number
  unit: string
  inspector: string
  conclusion: string
  measuredAt: string
}

export interface DispositionPlan {
  id: string
  action: '加密监测' | '降低库水位' | '疏通排水' | '应急撤离准备' | '工程加固'
  owner: string
  deadline: string
  conditions: string
  emergencyLinked: boolean
  approvedBy: string
  approvedAt: string
}

export interface Anomaly {
  id: string
  pointId: string
  title: string
  severity: Severity
  status: AnomalyStatus
  openedAt: string
  owner: string
  triggerReadingId: string
  observedValue: string
  fieldReviews: FieldReview[]
  retests: RetestRecord[]
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
  /** 现场复核提交时冻结的计划快照；升级前的老异常打开时按当时最新版补齐 */
  planSnapshot: PlanSnapshot | null
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholds: Threshold[]
  readings: RawReading[]
  plans: MonitoringPlan[]
  anomalies: Anomaly[]
  audit: AuditEntry[]
}

/** 审阅包导出的计划版本—原始读数—异常状态—审计时间对应行 */
export interface AnomalyCorrespondence {
  anomalyId: string
  title: string
  pointId: string
  zone: string
  monitoringType: string
  planVersion: string
  planFrequency: string
  dispositionVersion: string
  snapshotSource: string
  triggerReadingId: string
  triggerValue: string
  status: AnomalyStatus
  openedAt: string
  closedAt: string
  lastAuditAt: string
  lastAuditAction: string
}

export interface ReviewPackage {
  generatedAt: string
  plans: MonitoringPlan[]
  anomalies: Anomaly[]
  readings: RawReading[]
  correspondence: AnomalyCorrespondence[]
  audit: AuditEntry[]
}
