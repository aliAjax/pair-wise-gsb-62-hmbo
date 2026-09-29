import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { ReviewPackage } from '../domain'
import { TailingsApiService } from '../services/tailings-api.service'
import { selectCorrespondence, selectDataset } from '../store/tailings.selectors'

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>审计与版本追溯</h2><p>计划草拟与发布、异常创建、原始读数、现场复核、复测、审批和关闭全部留痕；已关闭记录不再改写。</p></div><button mat-flat-button color="primary" (click)="exportPackage()">导出审阅包</button></div>

      <h3>计划版本—原始读数—异常状态—审计时间对应关系</h3>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索异常、分区、版本</mat-label><input matInput [(ngModel)]="corrKeyword" /></mat-form-field><span>共{{ (filteredCorrespondence$ | async)?.length }}条对应记录</span></div>
      <table mat-table [dataSource]="filteredCorrespondence$ | async" class="panel">
        <ng-container matColumnDef="planVersion"><th mat-header-cell *matHeaderCellDef>计划版本 / 来源</th><td mat-cell *matCellDef="let row"><b>{{ row.planVersion }}</b><small class="sub">{{ row.snapshotSource }}<span class="legacy" *ngIf="row.snapshotSource === '—'">升级前已关闭，未补齐</span></small></td></ng-container>
        <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型/频率</th><td mat-cell *matCellDef="let row">{{ row.monitoringType }}<small class="sub">{{ row.planFrequency }}</small></td></ng-container>
        <ng-container matColumnDef="disposition"><th mat-header-cell *matHeaderCellDef>处置版本</th><td mat-cell *matCellDef="let row">{{ row.dispositionVersion }}</td></ng-container>
        <ng-container matColumnDef="anomaly"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row">{{ row.anomalyId }}<small class="sub">{{ row.title }}</small></td></ng-container>
        <ng-container matColumnDef="reading"><th mat-header-cell *matHeaderCellDef>原始读数</th><td mat-cell *matCellDef="let row">{{ row.triggerReadingId }}<small class="sub">{{ row.triggerValue }}</small></td></ng-container>
        <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>异常状态</th><td mat-cell *matCellDef="let row"><span [class.closed]="row.status === '已关闭'">{{ row.status }}</span><small class="sub">开 {{ row.openedAt.replace('T', ' ').slice(0, 16) }}<span *ngIf="row.closedAt !== '—'"> · 关 {{ row.closedAt.replace('T', ' ').slice(0, 16) }}</span></small></td></ng-container>
        <ng-container matColumnDef="audit"><th mat-header-cell *matHeaderCellDef>最近审计</th><td mat-cell *matCellDef="let row">{{ row.lastAuditAction }}<small class="sub">{{ row.lastAuditAt === '—' ? '—' : row.lastAuditAt.replace('T', ' ').slice(0, 16) }}</small></td></ng-container>
        <tr mat-header-row *matHeaderRowDef="correspondenceColumns"></tr><tr mat-row *matRowDef="let row; columns: correspondenceColumns" [class.closed-row]="row.status === '已关闭'"></tr>
      </table>

      <h3 class="timeline-title">审计时间线</h3>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row"><b [class.conflict]="row.action.includes('冲突')">{{ row.action }}</b></td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}</td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; } h3 { font-size: 15px; margin: 18px 0 8px; }.timeline-title { border-top: 1px solid #dde4e2; padding-top: 16px; }
    .toolbar { display: flex; align-items: center; gap: 12px; }.toolbar span { color: #72807d; font-size: 11px; }.panel { width: 100%; background: white; border: 1px solid #d9e1df; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 2px; }.closed-row { background: #f4f6f5; }.closed { color: #5a6a66; }.legacy { color: #8b602f; margin-left: 6px; }.conflict { color: #a23b34; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  corrKeyword = ''
  readonly columns = ['time', 'entity', 'action', 'operator', 'detail']
  readonly correspondenceColumns = ['planVersion', 'type', 'disposition', 'anomaly', 'reading', 'status', 'audit']
  private readonly dataset$ = this.store.select(selectDataset)
  readonly correspondence$ = this.store.select(selectCorrespondence)
  readonly filteredCorrespondence$ = this.correspondence$.pipe(map((rows) => rows.filter((row) => {
    const text = `${row.anomalyId} ${row.title} ${row.zone} ${row.planVersion} ${row.monitoringType} ${row.status} ${row.snapshotSource}`.toLowerCase()
    return !this.corrKeyword || text.includes(this.corrKeyword.toLowerCase())
  })))
  readonly filtered$ = this.dataset$.pipe(map((dataset) => dataset.audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(this.keyword))))
  exportPackage(): void {
    this.dataset$.subscribe((dataset) => {
      this.correspondence$.subscribe((correspondence) => {
        const payload: ReviewPackage = {
          generatedAt: new Date().toISOString(),
          plans: dataset.plans,
          anomalies: dataset.anomalies,
          readings: dataset.readings,
          correspondence,
          audit: dataset.audit
        }
        this.api.exportPackage(payload).subscribe((blob) => {
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = '尾矿库监测审阅包.json'; anchor.click(); URL.revokeObjectURL(url)
        })
      }).unsubscribe()
    }).unsubscribe()
  }
}
