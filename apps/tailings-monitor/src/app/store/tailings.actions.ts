import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type { AuditEntry, DispositionPlan, ExpertOpinion, FieldReview, PlanDraft, TailingsDataset } from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),
    /** 草拟：保存某分区尚未发布的计划草稿（不影响已发布版本） */
    'Save Plan Draft': props<{ draft: PlanDraft }>(),
    /** 负责人发布；携带草稿所基于的版本号用于乐观并发校验 */
    'Publish Plan': props<{ zone: string; publisher: string; baseVersion: number; note: string }>(),
    /** 冲突后重新确认：以当前最新版本为基础继续发布，不覆盖先发布者的版本 */
    'Confirm Publish Plan': props<{ zone: string; publisher: string; note: string }>(),
    /** 演示/外部事件：另一负责人直接发布新版本（不经过当前草稿），用于触发乐观锁冲突 */
    'External Publish Plan': props<{ zone: string; publisher: string; note: string }>(),
    'Select Zone': props<{ zone: string }>(),
    /** 异常进入现场复核：冻结当时的监测类型、频率和处置版本 */
    'Enter Field Review': props<{ anomalyId: string; inspector: string }>(),
    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Reset Demo': emptyProps()
  }
})
