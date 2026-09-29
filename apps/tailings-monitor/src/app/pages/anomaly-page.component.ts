import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import type { Anomaly, DispositionPlan, ExpertOpinion, FieldReview, TailingsDataset } from '../domain'
import { triggerReadingOf } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectFilteredAnomalies, selectSelectedAnomaly, selectTailings } from '../store/tailings.selectors'

@Component({
  selector: 'app-anomaly-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>待现场复核</span><strong>{{ count('待现场复核') }}</strong><small>进入复核即冻结计划版本</small></article>
        <article><span>调查与审批</span><strong>{{ count('原因调查中') + count('待负责人审批') }}</strong><small>多专业意见并存</small></article>
        <article><span>应急联动</span><strong>{{ count('应急联动') }}</strong><small>重大异常强制联动</small></article>
        <article><span>已关闭</span><strong>{{ count('已关闭') }}</strong><small>记录封存不再改写</small></article>
      </div>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索异常</mat-label><input matInput [(ngModel)]="localKeyword" (ngModelChange)="updateKeyword($event)" /></mat-form-field><mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="localStatus" (ngModelChange)="updateStatus($event)"><mat-option value="全部">全部</mat-option><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field></div>
      <div class="split">
        <table mat-table [dataSource]="filtered$ | async" class="panel">
          <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.id }} · {{ row.pointId }}</small></td></ng-container>
          <ng-container matColumnDef="severity"><th mat-header-cell *matHeaderCellDef>级别</th><td mat-cell *matCellDef="let row"><span class="severity" [class.major]="row.severity === '重大'">{{ row.severity }}</span></td></ng-container>
          <ng-container matColumnDef="plan"><th mat-header-cell *matHeaderCellDef>计划版本</th><td mat-cell *matCellDef="let row"><span class="plan-tag" *ngIf="row.planSnapshot">{{ row.planSnapshot.zone }} V{{ row.planSnapshot.planVersion }}<small>{{ row.planSnapshot.source === 'backfilled' ? '补齐' : '冻结' }}</small></span><span class="plan-tag none" *ngIf="!row.planSnapshot">未进入复核</span></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}</td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button (click)="select(row.id)">审阅</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected]="row.id === (selected$ | async)?.id"></tr>
        </table>
        <div class="panel detail" *ngIf="selected$ | async as selected">
          <div class="detail-head"><div><span>{{ selected.id }} · V{{ selected.version }}</span><h2>{{ selected.title }}</h2><p>{{ selected.observedValue }}</p></div><span class="severity" [class.major]="selected.severity === '重大'">{{ selected.severity }}</span></div>

          <div class="correspondence">
            <h3>计划版本 · 原始读数 · 状态 对应关系</h3>
            <dl>
              <dt>冻结计划</dt><dd *ngIf="selected.planSnapshot as snap"><b>{{ snap.zone }}监测计划 V{{ snap.planVersion }}</b>（{{ snap.source === 'backfilled' ? '升级前异常，按打开时最新版本补齐' : '进入现场复核时冻结' }}，{{ snap.publishedBy }} 发布）</dd><dd *ngIf="!selected.planSnapshot" class="muted">尚未进入现场复核，暂无冻结快照</dd>
              <dt>监测类型/频率</dt><dd *ngIf="selected.planSnapshot"><ng-container *ngFor="let item of selected.planSnapshot.items">{{ item.type }} {{ item.frequency }}（处置依据V{{ item.dispositionVersion }}）； </ng-container></dd><dd *ngIf="!selected.planSnapshot" class="muted">进入复核后按当时计划锁定</dd>
              <dt>原始读数</dt><dd><ng-container *ngIf="readingOf(selected) as r"><b>{{ r.value }} {{ r.unit }}</b> · {{ r.capturedAt.replace('T', ' ').slice(0, 16) }} · 设备{{ r.deviceId }} · {{ r.quality }}（只读）</ng-container></dd>
              <dt>异常状态</dt><dd><b [class.closed]="isClosed(selected)">{{ selected.status }}</b><small *ngIf="selected.closedAt"> · 关闭于 {{ selected.closedAt.replace('T', ' ').slice(0, 16) }}</small></dd>
            </dl>
            <button mat-flat-button color="primary" *ngIf="!selected.planSnapshot && !isClosed(selected)" (click)="enterReview(selected)">进入现场复核并冻结当前计划</button>
            <p class="sealed" *ngIf="isClosed(selected)">已关闭：复测、计划与审批均按 V{{ selected.planSnapshot?.planVersion }} 封存，不再接受改写。</p>
          </div>

          <h3>现场复核（继续按 V{{ selected.planSnapshot?.planVersion ?? '—' }} 执行）</h3>
          <div class="review-form" *ngIf="!isClosed(selected)"><mat-form-field appearance="outline" class="wide"><mat-label>现场观察</mat-label><textarea matInput rows="2" [(ngModel)]="fieldForm.observed"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>证据清单</mat-label><input matInput [(ngModel)]="fieldForm.evidence" /></mat-form-field><mat-form-field appearance="outline"><mat-label>重新评估</mat-label><input matInput [(ngModel)]="fieldForm.reassessment" /></mat-form-field><button mat-flat-button color="primary" [disabled]="!selected.planSnapshot" (click)="submitReview(selected)">{{ selected.planSnapshot ? '提交复核版本' : '需先进入现场复核' }}</button></div>
          <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · V{{ review.version }} <small>按计划 V{{ selected.planSnapshot?.planVersion }}</small></b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>
          <h3>专业意见</h3>
          <div class="opinion-form" *ngIf="!isClosed(selected)"><mat-form-field appearance="outline"><mat-label>专业</mat-label><mat-select [(ngModel)]="opinionForm.discipline"><mat-option *ngFor="let item of disciplines" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>意见</mat-label><input matInput [(ngModel)]="opinionForm.content" /></mat-form-field><button mat-button (click)="addOpinion(selected)">补充意见</button></div>
          <div class="opinions"><article *ngFor="let opinion of selected.opinions"><b>{{ opinion.discipline }}专家 {{ opinion.specialist }}</b><span>{{ opinion.conclusion }}</span><p>{{ opinion.content }}</p></article></div>
          <h3>处置方案与会签</h3>
          <div class="plan-form" *ngIf="!isClosed(selected)"><mat-form-field appearance="outline"><mat-label>措施</mat-label><mat-select [(ngModel)]="planForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="planForm.owner" /></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>关闭条件</mat-label><textarea matInput rows="2" [(ngModel)]="planForm.conditions"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>截止</mat-label><input matInput type="datetime-local" [(ngModel)]="planForm.deadline" /></mat-form-field><button mat-button (click)="savePlan(selected)">提交审批</button></div>
          <div class="approval-band"><div><b>{{ selected.plan.approvedBy || '尚未审批' }}</b><span>{{ selected.plan.conditions }}</span></div><button mat-flat-button color="primary" [disabled]="isClosed(selected) || (selected.severity === '重大' && !selected.plan.emergencyLinked)" (click)="approve(selected)">负责人审批</button><button mat-button color="warn" [disabled]="isClosed(selected)" (click)="emergency(selected)">应急联动</button><button mat-button [disabled]="isClosed(selected) || selected.status !== '待负责人审批'" (click)="close(selected)">关闭异常</button></div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 14px; }.metrics article { padding: 16px 18px; border-right: 1px solid #e2e7e6; }.metrics article:last-child { border: 0; }.metrics span, .metrics strong, .metrics small { display: block; }.metrics span { color: #72807d; font-size: 12px; }.metrics strong { font-size: 26px; color: #245060; margin: 6px 0; }.metrics small { color: #98a4a0; font-size: 10px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 10px; }.split { display: grid; grid-template-columns: minmax(600px,1fr) 560px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }.selected { background: #eef5f4; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.severity { padding: 3px 7px; border-radius: 3px; background: #f7edd6; color: #8e681d; font-size: 11px; }.severity.major { background: #fae7e5; color: #a23b34; }.plan-tag { display: inline-flex; gap: 4px; align-items: center; background: #e8f1f4; color: #2f6f86; padding: 3px 7px; border-radius: 3px; font-size: 11px; }.plan-tag small { background: #2f6f86; color: white; padding: 1px 4px; border-radius: 2px; }.plan-tag.none { background: #f0f2f1; color: #8a9793; }
    .detail { padding: 16px; max-height: 78vh; overflow: auto; }.detail-head { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #e1e6e5; padding-bottom: 12px; }.detail-head span { color: #74827f; font-size: 10px; }.detail-head h2 { margin: 4px 0; font-size: 18px; }.detail-head p { margin: 0; color: #65736f; font-size: 12px; }.detail h3 { font-size: 13px; margin: 16px 0 8px; }
    .correspondence { background: #f5f8f7; border-left: 3px solid #2f6f86; padding: 10px 12px; margin-top: 12px; }.correspondence h3 { margin: 0 0 8px; font-size: 12px; color: #245060; }.correspondence dl { display: grid; grid-template-columns: 86px 1fr; gap: 5px 10px; margin: 0 0 8px; }.correspondence dt { color: #74827f; font-size: 11px; }.correspondence dd { margin: 0; font-size: 11px; color: #40514d; }.correspondence .muted { color: #98a4a0; }.correspondence .closed { color: #a43c35; }.sealed { margin: 6px 0 0; color: #a43c35; font-size: 11px; }
    .review-form, .opinion-form, .plan-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.review-form .wide, .opinion-form .wide, .plan-form .wide { grid-column: 1 / -1; }.review-form button, .plan-form button { align-self: center; }.records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records p { margin: 0; font-size: 12px; }.records span { color: #72807d; font-size: 10px; }.records small { color: #2f6f86; }
    .opinions article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; grid-template-columns: 1fr auto; gap: 4px; }.opinions p { grid-column: 1 / -1; margin: 0; font-size: 12px; }.opinions span { color: #8a6720; font-size: 10px; }
    .approval-band { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 7px; background: #f6f0df; border-left: 3px solid #c99f3d; padding: 10px; margin-top: 12px; }.approval-band b, .approval-band span { display: block; }.approval-band span { color: #746c55; font-size: 10px; margin-top: 4px; }
  `]
})
export class AnomalyPageComponent {
  private readonly store = inject(Store)
  readonly filtered$ = this.store.select(selectFilteredAnomalies)
  readonly selected$ = this.store.select(selectSelectedAnomaly)
  readonly all$ = this.store.select(selectAnomalies)
  readonly columns = ['title', 'severity', 'plan', 'status', 'version', 'open']
  readonly statuses: Anomaly['status'][] = ['待现场复核', '原因调查中', '待负责人审批', '应急联动', '已关闭']
  readonly disciplines: ExpertOpinion['discipline'][] = ['坝体', '水文', '岩土', '应急']
  readonly actions: DispositionPlan['action'][] = ['加密监测', '降低库水位', '疏通排水', '应急撤离准备', '工程加固']
  localKeyword = ''
  localStatus: Anomaly['status'] | '全部' = '全部'
  fieldForm = { observed: '', evidence: '', reassessment: '' }
  opinionForm = { discipline: '坝体' as ExpertOpinion['discipline'], content: '' }
  planForm = { action: '加密监测' as DispositionPlan['action'], owner: '坝体安全组', conditions: '', deadline: '2026-09-29T18:00' }
  private dataset: TailingsDataset | null = null
  constructor() {
    this.store.select(selectTailings).subscribe((state) => { this.dataset = state.dataset })
  }
  count(status: Anomaly['status']): number { let value = 0; this.all$.subscribe((items) => { value = items.filter((item) => item.status === status).length }).unsubscribe(); return value }
  isClosed(anomaly: Anomaly): boolean { return anomaly.status === '已关闭' }
  readingOf(anomaly: Anomaly) { return this.dataset ? triggerReadingOf(this.dataset, anomaly) : undefined }
  updateKeyword(value: string): void { this.store.dispatch(TailingsActions.updateKeyword({ keyword: value })) }
  updateStatus(value: Anomaly['status'] | '全部'): void { this.store.dispatch(TailingsActions.updateStatus({ status: value })) }
  select(id: string): void { this.store.dispatch(TailingsActions.selectAnomaly({ anomalyId: id })) }
  enterReview(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.enterFieldReview({ anomalyId: anomaly.id, inspector: '宋立' })) }
  submitReview(anomaly: Anomaly): void {
    const review: FieldReview = { id: `FR-${Date.now()}`, inspector: '宋立', arrivedAt: new Date().toISOString(), ...this.fieldForm, version: 0 }
    this.store.dispatch(TailingsActions.submitFieldReview({ anomalyId: anomaly.id, review }))
    this.fieldForm = { observed: '', evidence: '', reassessment: '' }
  }
  addOpinion(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.addExpertOpinion({ anomalyId: anomaly.id, opinion: { id: `OP-${Date.now()}`, specialist: '当前用户', ...this.opinionForm, conclusion: '补充证据', createdAt: new Date().toISOString() } })); this.opinionForm.content = '' }
  savePlan(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.saveDispositionPlan({ anomalyId: anomaly.id, plan: { id: anomaly.plan.id, ...this.planForm, emergencyLinked: anomaly.plan.emergencyLinked, approvedBy: '', approvedAt: '' } })) }
  approve(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.approvePlan({ anomalyId: anomaly.id, approver: '负责人 何清', note: '同意执行，严格执行关闭条件。' })) }
  emergency(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.createEmergencyLink({ anomalyId: anomaly.id, note: '重大异常联动应急值班，通知下游巡查。' })) }
  close(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.closeAnomaly({ anomalyId: anomaly.id, note: '复测数据稳定，关闭条件已满足。' })) }
}
