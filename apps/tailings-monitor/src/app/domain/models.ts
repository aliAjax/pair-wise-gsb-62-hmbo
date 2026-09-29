export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'

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

/** 分区监测计划中的单类监测项：类型、频率及该类型依据的处置（阈值）版本 */
export interface PlanItem {
  type: MonitoringType
  frequency: string
  thresholdVersion: number
  /** 处置依据版本：阈值/处置标准的版本号，随计划版本一起冻结 */
  dispositionVersion: number
}

/** 已发布的分区监测计划版本，发布后内容不可修改 */
export interface MonitoringPlanVersion {
  id: string
  zone: string
  version: number
  items: PlanItem[]
  remark: string
  publishedBy: string
  publishedAt: string
}

/** 尚未发布的分区计划草稿，基于某个已发布版本调整 */
export interface PlanDraft {
  zone: string
  baseVersion: number
  items: PlanItem[]
  remark: string
  updatedBy: string
  updatedAt: string
}

/**
 * 异常进入现场复核时冻结的计划快照。
 * 之后的复测、审批、关闭均继续认这一版，已关闭记录也不再改写。
 */
export interface PlanSnapshot {
  zone: string
  planId: string
  planVersion: number
  items: PlanItem[]
  /** 快照依据的原始触发读数 */
  triggerReadingId: string
  /** pinned：进入现场复核时冻结；backfilled：升级前老异常按打开时最新版本补齐 */
  source: 'pinned' | 'backfilled'
  pinnedAt: string
  publishedAt: string
  publishedBy: string
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
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
  /** 进入现场复核时冻结的计划快照；待现场复核且尚未进入复核的异常为空 */
  planSnapshot?: PlanSnapshot
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
  anomalies: Anomaly[]
  audit: AuditEntry[]
  /** 按分区保存的全部已发布计划版本（旧→新） */
  planVersions: MonitoringPlanVersion[]
}
