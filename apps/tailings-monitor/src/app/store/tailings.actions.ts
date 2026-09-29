import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type { AuditEntry, DispositionPlan, ExpertOpinion, FieldReview, MonitoringPlan, MonitoringPlanItem, PlanChangeScope, RetestRecord, TailingsDataset } from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),
    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Submit Retest': props<{ anomalyId: string; retest: RetestRecord }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Select Plan Zone': props<{ zone: string }>(),
    'Save Plan Draft': props<{ zone: string; changeScope: PlanChangeScope; reason: string; items: MonitoringPlanItem[]; operator: string }>(),
    'Publish Plan': props<{ planId: string; publisher: string }>(),
    'Confirm Publish Plan': props<{ planId: string; publisher: string }>(),
    'Discard Plan Draft': props<{ zone: string }>(),
    'Dismiss Publish Conflict': emptyProps(),
    'Reset Demo': emptyProps()
  }
})
