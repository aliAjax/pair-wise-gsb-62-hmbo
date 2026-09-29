import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import type { Anomaly, DispositionPlan, ExpertOpinion, FieldReview, RawReading } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectFilteredAnomalies, selectSelectedAnomaly } from '../store/tailings.selectors'

@Component({
  selector: 'app-anomaly-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>待现场复核</span><strong>{{ count('待现场复核') }}</strong><small>不得直接关闭</small></article>
        <article><span>调查与审批</span><strong>{{ count('原因调查中') + count('待负责人审批') }}</strong><small>多专业意见并存</small></article>
        <article><span>应急联动</span><strong>{{ count('应急联动') }}</strong><small>重大异常强制联动</small></article>
        <article><span>已关闭</span><strong>{{ count('已关闭') }}</strong><small>快照与读数不再改写</small></article>
      </div>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索异常</mat-label><input matInput [(ngModel)]="localKeyword" (ngModelChange)="updateKeyword($event)" /></mat-form-field><mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="localStatus" (ngModelChange)="updateStatus($event)"><mat-option value="全部">全部</mat-option><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field></div>
      <div class="split">
        <table mat-table [dataSource]="filtered$ | async" class="panel">
          <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.id }} · {{ row.pointId }}</small><small class="sub" *ngIf="row.planSnapshot as snap">计划版本 {{ snap.zone }} V{{ snap.version }}<span class="tag backfill" *ngIf="snap.source === '升级补齐'">升级补齐</span></small></td></ng-container>
          <ng-container matColumnDef="severity"><th mat-header-cell *matHeaderCellDef>级别</th><td mat-cell *matCellDef="let row"><span class="severity" [class.major]="row.severity === '重大'">{{ row.severity }}</span></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}<span class="tag closed" *ngIf="row.status === '已关闭'">只读</span></td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button (click)="select(row.id)">审阅</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected]="row.id === (selected$ | async)?.id"></tr>
        </table>
        <div class="panel detail" *ngIf="selected$ | async as selected">
          <div class="detail-head"><div><span>{{ selected.id }} · V{{ selected.version }}</span><h2>{{ selected.title }}</h2><p>{{ selected.observedValue }}</p><p class="reading" *ngIf="triggerReading(selected) as reading">原始读数 {{ reading.id }}：<b>{{ reading.value }} {{ reading.unit }}</b>（{{ reading.quality }}，{{ reading.capturedAt.replace('T', ' ').slice(0, 16) }}，设备{{ reading.deviceId }}）</p></div><span class="severity" [class.major]="selected.severity === '重大'">{{ selected.severity }}</span></div>

          <div class="closed-band" *ngIf="selected.status === '已关闭'">该异常已于 {{ selected.closedAt.replace('T', ' ').slice(0, 16) }} 关闭；计划版本、原始读数、复核与复测记录均已冻结，界面与审阅包不再改写。</div>

          <h3>执行依据：监测计划快照</h3>
          <div class="snapshot" *ngIf="selected.planSnapshot as snap; else noSnapshot">
            <div><span>分区/计划版本</span><b>{{ snap.zone }} V{{ snap.version }}</b></div>
            <div><span>监测类型</span><b>{{ snap.type }}</b></div>
            <div><span>频率</span><b>{{ snap.frequency }}</b></div>
            <div><span>处置版本</span><b>V{{ snap.dispositionVersion }}</b></div>
            <div class="wide"><span>处置依据</span><b>{{ snap.dispositionBasis }}</b></div>
            <div><span>发布人</span><b>{{ snap.publishedBy }}</b></div>
            <div><span>冻结时间</span><b>{{ snap.frozenAt.replace('T', ' ').slice(0, 16) }}</b></div>
            <div class="wide" *ngIf="snap.source === '升级补齐'"><span class="tag backfill">升级补齐</span><b>该异常为升级前记录，{{ snap.backfilledAt.replace('T', ' ').slice(0, 16) }} 打开时按当时最新版本补齐；后续复测与关闭认此版本。</b></div>
          </div>
          <ng-template #noSnapshot><div class="snapshot empty" *ngIf="selected.status !== '已关闭'; else legacyClosed">升级前异常尚无计划快照，打开本记录时将按当前最新已发布版本补齐，再进入现场复核。</div><ng-template #legacyClosed><div class="snapshot legacy">升级前已关闭记录：关闭时计划快照功能尚未上线，按历史记录保留，不再补齐或改写。</div></ng-template></ng-template>

          <ng-container *ngIf="selected.status !== '已关闭'">
            <h3>现场复核</h3>
            <div class="review-form"><mat-form-field appearance="outline" class="wide"><mat-label>现场观察</mat-label><textarea matInput rows="2" [(ngModel)]="fieldForm.observed"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>证据清单</mat-label><input matInput [(ngModel)]="fieldForm.evidence" /></mat-form-field><mat-form-field appearance="outline"><mat-label>重新评估</mat-label><input matInput [(ngModel)]="fieldForm.reassessment" /></mat-form-field><button mat-flat-button color="primary" (click)="submitReview(selected)">提交复核并冻结计划版本</button></div>
            <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · 复核V{{ review.version }}<span class="plan-ref" *ngIf="selected.planSnapshot as snap">执行 {{ snap.zone }} V{{ snap.version }}（{{ snap.frequency }}）</span></b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>

            <h3>复测（认快照版本，不随计划再发布而变）</h3>
            <div class="retest-form" *ngIf="selected.planSnapshot as snap">
              <mat-form-field appearance="outline"><mat-label>复测值</mat-label><input matInput type="number" [(ngModel)]="retestForm.value" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>单位</mat-label><input matInput [(ngModel)]="retestForm.unit" /></mat-form-field>              <mat-form-field appearance="outline" class="wide"><mat-label>复测结论（按 {{ snap.frequency }} / V{{ snap.version }} 执行）</mat-label><input matInput [(ngModel)]="retestForm.conclusion" /></mat-form-field>
              <button mat-button color="primary" [disabled]="!retestForm.conclusion.trim()" (click)="submitRetest(selected)">提交复测</button>
            </div>
            <div class="retest-empty" *ngIf="!selected.planSnapshot">补齐/冻结计划快照后才能登记复测。</div>
            <div class="records" *ngFor="let retest of selected.retests"><b>复测 V{{ retest.planVersion }} · {{ retest.frequency }} · {{ retest.value }}{{ retest.unit }}<span class="plan-ref">{{ retest.inspector }} · {{ retest.measuredAt.replace('T', ' ').slice(0, 16) }}</span></b><p>{{ retest.conclusion }}</p></div>

            <h3>专业意见</h3>
            <div class="opinion-form"><mat-form-field appearance="outline"><mat-label>专业</mat-label><mat-select [(ngModel)]="opinionForm.discipline"><mat-option *ngFor="let item of disciplines" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>意见</mat-label><input matInput [(ngModel)]="opinionForm.content" /></mat-form-field><button mat-button (click)="addOpinion(selected)">补充意见</button></div>
            <div class="opinions"><article *ngFor="let opinion of selected.opinions"><b>{{ opinion.discipline }}专家 {{ opinion.specialist }}</b><span>{{ opinion.conclusion }}</span><p>{{ opinion.content }}</p></article></div>

            <h3>处置方案与会签</h3>
            <div class="plan-form"><mat-form-field appearance="outline"><mat-label>措施</mat-label><mat-select [(ngModel)]="planForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="planForm.owner" /></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>关闭条件</mat-label><textarea matInput rows="2" [(ngModel)]="planForm.conditions"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>截止</mat-label><input matInput type="datetime-local" [(ngModel)]="planForm.deadline" /></mat-form-field><button mat-button (click)="savePlan(selected)">提交审批</button></div>
            <div class="approval-band"><div><b>{{ selected.plan.approvedBy || '尚未审批' }}</b><span>{{ selected.plan.conditions }}</span><span class="plan-ref" *ngIf="selected.planSnapshot as snap">关闭须依据 {{ snap.zone }} V{{ snap.dispositionVersion }}，并至少完成一次复测</span></div><button mat-flat-button color="primary" [disabled]="selected.severity === '重大' && !selected.plan.emergencyLinked" (click)="approve(selected)">负责人审批</button><button mat-button color="warn" (click)="emergency(selected)">应急联动</button><button mat-button [disabled]="!canClose(selected)" (click)="close(selected)">关闭异常</button></div>
          </ng-container>

          <ng-container *ngIf="selected.status === '已关闭'">
            <h3>复核与复测（历史留痕）</h3>
            <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · 复核V{{ review.version }}<span class="plan-ref" *ngIf="selected.planSnapshot as snap">执行 {{ snap.zone }} V{{ snap.version }}（{{ snap.frequency }}）</span></b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>
            <div class="records" *ngFor="let retest of selected.retests"><b>复测 V{{ retest.planVersion }} · {{ retest.frequency }} · {{ retest.value }}{{ retest.unit }}</b><p>{{ retest.conclusion }} · {{ retest.inspector }} {{ retest.measuredAt.replace('T', ' ').slice(0, 16) }}</p></div>
            <div class="approval-band closed"><div><b>{{ selected.plan.approvedBy || '历史审批人未记录' }}</b><span>{{ selected.plan.conditions }}</span></div></div>
          </ng-container>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 14px; }.metrics article { padding: 16px 18px; border-right: 1px solid #e2e7e6; }.metrics article:last-child { border: 0; }.metrics span, .metrics strong, .metrics small { display: block; }.metrics span { color: #72807d; font-size: 12px; }.metrics strong { font-size: 26px; color: #245060; margin: 6px 0; }.metrics small { color: #98a4a0; font-size: 10px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 10px; }.split { display: grid; grid-template-columns: minmax(600px,1fr) 560px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }.selected { background: #eef5f4; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.severity { padding: 3px 7px; border-radius: 3px; background: #f7edd6; color: #8e681d; font-size: 11px; }.severity.major { background: #fae7e5; color: #a23b34; }.tag { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 3px; font-size: 10px; }.tag.backfill { background: #e3edf8; color: #2b5d8f; }.tag.closed { background: #e5ecea; color: #5a6a66; }
    .detail { padding: 16px; }.detail-head { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #e1e6e5; padding-bottom: 12px; }.detail-head span { color: #74827f; font-size: 10px; }.detail-head h2 { margin: 4px 0; font-size: 18px; }.detail-head p { margin: 0; color: #65736f; font-size: 12px; }.detail-head p.reading { margin-top: 5px; color: #40545a; }.detail h3 { font-size: 13px; margin: 16px 0 8px; }
    .closed-band { background: #e5ecea; border-left: 3px solid #5a7a70; color: #425952; font-size: 12px; padding: 9px 12px; margin-top: 12px; }
    .snapshot { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; background: #eef5f4; border-left: 3px solid #315d6e; padding: 11px 13px; }.snapshot div { display: grid; gap: 2px; }.snapshot .wide { grid-column: 1 / -1; }.snapshot span { color: #72807d; font-size: 10px; }.snapshot b { font-size: 12px; color: #213a44; font-weight: 600; }.snapshot.empty { background: #f6f0df; border-left-color: #c99f3d; color: #7a6a45; font-size: 12px; display: block; }.snapshot.legacy { background: #eceeec; border-left-color: #8b968f; color: #66726e; font-size: 12px; display: block; }
    .review-form, .opinion-form, .plan-form, .retest-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.review-form .wide, .opinion-form .wide, .plan-form .wide, .retest-form .wide { grid-column: 1 / -1; }.review-form button, .plan-form button, .retest-form button { align-self: center; }.retest-empty { font-size: 11px; color: #936d20; background: #faf4e3; padding: 8px 10px; margin-bottom: 6px; }
    .records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records p { margin: 0; font-size: 12px; }.records span { color: #72807d; font-size: 10px; }.records b { font-size: 12px; display: flex; justify-content: space-between; align-items: baseline; }.plan-ref { color: #2b5d8f !important; font-weight: 400; }
    .opinions article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; grid-template-columns: 1fr auto; gap: 4px; }.opinions p { grid-column: 1 / -1; margin: 0; font-size: 12px; }.opinions span { color: #8a6720; font-size: 10px; }
    .approval-band { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 7px; background: #f6f0df; border-left: 3px solid #c99f3d; padding: 10px; margin-top: 12px; }.approval-band.closed { grid-template-columns: 1fr; background: #eceeec; border-left-color: #8b968f; }.approval-band b, .approval-band span { display: block; }.approval-band span { color: #746c55; font-size: 10px; margin-top: 4px; }
  `]
})
export class AnomalyPageComponent {
  private readonly store = inject(Store)
  readonly filtered$ = this.store.select(selectFilteredAnomalies)
  readonly selected$ = this.store.select(selectSelectedAnomaly)
  readonly all$ = this.store.select(selectAnomalies)
  private readonly dataset$ = this.store.select(selectDataset)
  readonly columns = ['title', 'severity', 'status', 'version', 'open']
  readonly statuses: Anomaly['status'][] = ['待现场复核', '原因调查中', '待负责人审批', '应急联动', '已关闭']
  readonly disciplines: ExpertOpinion['discipline'][] = ['坝体', '水文', '岩土', '应急']
  readonly actions: DispositionPlan['action'][] = ['加密监测', '降低库水位', '疏通排水', '应急撤离准备', '工程加固']
  localKeyword = ''
  localStatus: Anomaly['status'] | '全部' = '全部'
  fieldForm = { observed: '', evidence: '', reassessment: '' }
  retestForm = { value: 0, unit: 'mm', conclusion: '' }
  opinionForm = { discipline: '坝体' as ExpertOpinion['discipline'], content: '' }
  planForm = { action: '加密监测' as DispositionPlan['action'], owner: '坝体安全组', conditions: '', deadline: '2026-09-29T18:00' }
  count(status: Anomaly['status']): number { let value = 0; this.all$.subscribe((items) => { value = items.filter((item) => item.status === status).length }).unsubscribe(); return value }
  triggerReading(anomaly: Anomaly): RawReading | undefined {
    let reading: RawReading | undefined
    this.dataset$.subscribe((dataset) => { reading = dataset.readings.find((item) => item.id === anomaly.triggerReadingId) }).unsubscribe()
    return reading
  }
  canClose(anomaly: Anomaly): boolean {
    return anomaly.status === '待负责人审批' && !!anomaly.plan.approvedBy && anomaly.fieldReviews.length > 0 && anomaly.retests.length > 0
  }
  updateKeyword(value: string): void { this.store.dispatch(TailingsActions.updateKeyword({ keyword: value })) }
  updateStatus(value: Anomaly['status'] | '全部'): void { this.store.dispatch(TailingsActions.updateStatus({ status: value })) }
  select(id: string): void { this.store.dispatch(TailingsActions.selectAnomaly({ anomalyId: id })) }
  submitReview(anomaly: Anomaly): void {
    if (!this.fieldForm.observed.trim() || !this.fieldForm.evidence.trim() || !this.fieldForm.reassessment.trim()) return
    const review: FieldReview = { id: `FR-${Date.now()}`, inspector: '宋立', arrivedAt: new Date().toISOString(), ...this.fieldForm, version: 0 }
    this.store.dispatch(TailingsActions.submitFieldReview({ anomalyId: anomaly.id, review }))
  }
  submitRetest(anomaly: Anomaly): void {
    if (!anomaly.planSnapshot || !this.retestForm.conclusion.trim()) return
    this.store.dispatch(TailingsActions.submitRetest({
      anomalyId: anomaly.id,
      retest: {
        id: `RT-${Date.now()}`,
        planVersion: anomaly.planSnapshot.version,
        frequency: anomaly.planSnapshot.frequency,
        value: this.retestForm.value,
        unit: this.retestForm.unit.trim() || '—',
        inspector: '宋立',
        conclusion: this.retestForm.conclusion.trim(),
        measuredAt: new Date().toISOString()
      }
    }))
  }
  addOpinion(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.addExpertOpinion({ anomalyId: anomaly.id, opinion: { id: `OP-${Date.now()}`, specialist: '当前用户', ...this.opinionForm, conclusion: '补充证据', createdAt: new Date().toISOString() } })) }
  savePlan(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.saveDispositionPlan({ anomalyId: anomaly.id, plan: { id: anomaly.plan.id, ...this.planForm, emergencyLinked: anomaly.plan.emergencyLinked, approvedBy: '', approvedAt: '' } })) }
  approve(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.approvePlan({ anomalyId: anomaly.id, approver: '负责人 何清', note: '同意执行，严格按冻结计划版本与关闭条件执行。' })) }
  emergency(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.createEmergencyLink({ anomalyId: anomaly.id, note: '重大异常联动应急值班，通知下游巡查。' })) }
  close(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.closeAnomaly({ anomalyId: anomaly.id, note: '按冻结计划版本完成复测，数据稳定，关闭条件已满足。' })) }
}
