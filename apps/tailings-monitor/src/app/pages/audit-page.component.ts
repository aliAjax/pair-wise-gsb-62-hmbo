import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { Anomaly, RawReading, TailingsDataset } from '../domain'
import { auditOf, triggerReadingOf } from '../domain'
import { TailingsApiService } from '../services/tailings-api.service'
import { selectDataset } from '../store/tailings.selectors'

interface ReviewPackage {
  exportedAt: string
  correspondence: CorrespondenceRow[]
  planVersions: TailingsDataset['planVersions']
  anomalies: TailingsDataset['anomalies']
  readings: TailingsDataset['readings']
  audit: TailingsDataset['audit']
}

interface CorrespondenceRow {
  anomaly: Anomaly
  reading?: RawReading
  planVersion: string
  planSource: string
  status: string
  auditedAt: string
}

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>审计与版本追溯</h2><p>计划发布、进入现场复核冻结快照、原始读数、复测评估、审批和关闭全部留痕；已关闭记录封存。</p></div><button mat-flat-button color="primary" (click)="exportPackage()">导出审阅包</button></div>

      <h3>计划版本 · 原始读数 · 异常状态 · 审计时间 对应关系</h3>
      <table mat-table [dataSource]="(rows$ | async) ?? []" class="panel map-table">
        <ng-container matColumnDef="anomaly"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let r"><b>{{ r.anomaly.title }}</b><small class="sub">{{ r.anomaly.id }}</small></td></ng-container>
        <ng-container matColumnDef="plan"><th mat-header-cell *matHeaderCellDef>计划版本</th><td mat-cell *matCellDef="let r">{{ r.planVersion }}<small class="sub">{{ r.planSource }}</small></td></ng-container>
        <ng-container matColumnDef="reading"><th mat-header-cell *matHeaderCellDef>原始读数</th><td mat-cell *matCellDef="let r"><span *ngIf="r.reading"><b>{{ r.reading.value }} {{ r.reading.unit }}</b><small class="sub">{{ r.reading.id }} · {{ r.reading.capturedAt.replace('T', ' ').slice(0, 16) }} · {{ r.reading.quality }}</small></span><span *ngIf="!r.reading" class="muted">—</span></td></ng-container>
        <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>异常状态</th><td mat-cell *matCellDef="let r"><span [class.closed]="r.status === '已关闭'">{{ r.status }}</span></td></ng-container>
        <ng-container matColumnDef="auditedAt"><th mat-header-cell *matHeaderCellDef>快照/审计时间</th><td mat-cell *matCellDef="let r">{{ r.auditedAt }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="mapColumns"></tr><tr mat-row *matRowDef="let row; columns: mapColumns" [class.sealed-row]="row.status === '已关闭'"></tr>
      </table>

      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row">{{ row.action }}</td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}</td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; }
    h3 { font-size: 14px; margin: 4px 0 8px; color: #245060; }.map-table { margin-bottom: 18px; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 2px; }.muted { color: #98a4a0; }.closed { color: #a43c35; font-weight: 600; }.sealed-row { background: #faf3f2; }
    .toolbar { display: flex; align-items: center; gap: 12px; }.toolbar span { color: #74827d; font-size: 11px; }.panel { width: 100%; background: white; border: 1px solid #d9e1df; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  readonly mapColumns = ['anomaly', 'plan', 'reading', 'status', 'auditedAt']
  readonly columns = ['time', 'entity', 'action', 'operator', 'detail']
  private readonly dataset$ = this.store.select(selectDataset)
  readonly rows$ = this.dataset$.pipe(map((dataset) => this.buildRows(dataset)))
  readonly filtered$ = this.dataset$.pipe(map((dataset) => dataset.audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(this.keyword))))

  private buildRows(dataset: TailingsDataset): CorrespondenceRow[] {
    return dataset.anomalies.map((anomaly) => {
      const snap = anomaly.planSnapshot
      const latestAudit = auditOf(dataset, anomaly)[0]
      return {
        anomaly,
        reading: triggerReadingOf(dataset, anomaly),
        planVersion: snap ? `${snap.zone} V${snap.planVersion}` : '未冻结',
        planSource: snap ? (snap.source === 'backfilled' ? '升级前异常，按打开时最新版本补齐' : `进入现场复核时冻结（${snap.publishedBy}）`) : '进入复核后冻结',
        status: anomaly.status,
        auditedAt: snap ? snap.pinnedAt.replace('T', ' ').slice(0, 16) : latestAudit?.createdAt.replace('T', ' ').slice(0, 16) ?? ''
      }
    })
  }

  exportPackage(): void {
    this.store.select(selectDataset).subscribe((dataset) => {
      const payload: ReviewPackage = {
        exportedAt: new Date().toISOString(),
        correspondence: this.buildRows(dataset),
        planVersions: dataset.planVersions,
        anomalies: dataset.anomalies,
        readings: dataset.readings,
        audit: dataset.audit
      }
      this.api.exportPackage(payload as unknown as TailingsDataset).subscribe((blob) => {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = '尾矿库监测审阅包.json'; anchor.click(); URL.revokeObjectURL(url)
      })
    }).unsubscribe()
  }
}
