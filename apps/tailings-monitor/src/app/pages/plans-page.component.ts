import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { Store } from '@ngrx/store'
import { combineLatest } from 'rxjs'
import type { MonitoringType, PlanDraft, PlanItem, TailingsDataset } from '../domain'
import { cloneItems, latestPlanVersion } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import type { PlanConflict } from '../store/tailings.reducer'
import { selectDataset, selectDrafts, selectPlanConflict, selectSelectedZone, selectZonePlanVersions } from '../store/tailings.selectors'

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <section class="page">
      <div class="head">
        <div><h2>汛期监测计划草拟与发布</h2><p>草稿不影响执行版本；负责人发布后形成新版本。同一分区两人先后发布时，晚到发布需重新确认，先发布版本不被覆盖。异常进入现场复核时按当时发布版本冻结监测类型、频率与处置版本。</p></div>
        <mat-form-field appearance="outline"><mat-label>分区</mat-label>
          <mat-select [value]="zone" (selectionChange)="changeZone($event.value)">
            <mat-option *ngFor="let z of zones" [value]="z">{{ z }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="split">
        <div class="panel editor">
          <div class="editor-head">
            <div><b>计划草稿 · {{ zone }}</b><small>基于已发布 V{{ baseVersion }} 调整，保存草稿不会发布；发布后生成 V{{ baseVersion + 1 }}</small></div>
            <span class="tag" *ngIf="draft">草稿已暂存 · {{ draft.updatedBy }} · {{ draft.updatedAt.replace('T', ' ').slice(0, 16) }}</span>
          </div>
          <div class="rows">
            <article *ngFor="let row of rows; let i = index">
              <b>{{ row.type }}</b>
              <mat-form-field appearance="outline"><mat-label>监测频率</mat-label><input matInput [(ngModel)]="rows[i].frequency" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>处置依据版本</mat-label><input matInput type="number" [(ngModel)]="rows[i].dispositionVersion" /></mat-form-field>
              <small>阈值版本 V{{ row.thresholdVersion }}</small>
            </article>
          </div>
          <mat-form-field appearance="outline" class="wide"><mat-label>调整说明</mat-label><textarea matInput rows="2" [(ngModel)]="remark"></textarea></mat-form-field>
          <div class="actions">
            <button mat-button (click)="saveDraft()">保存草稿</button>
            <button mat-flat-button color="primary" (click)="publish()">负责人发布 V{{ baseVersion + 1 }}</button>
            <button mat-stroked-button (click)="simulateEarlierPublish()">模拟另一负责人抢先发布</button>
          </div>

          <div class="conflict" *ngIf="conflict">
            <h3>检测到版本冲突</h3>
            <p>您的草稿基于 <b>V{{ conflict.baseVersion }}</b>，但 <b>{{ conflict.publishedBy }}</b> 已先发布 <b>V{{ conflict.currentVersion }}</b>（{{ conflict.publishedAt.replace('T', ' ').slice(0, 16) }}）。系统未覆盖对方调整，请先对照差异，重新确认后才会在对方版本之后发布新版本。</p>
            <div class="conflict-grid">
              <div><span>先发布版本 V{{ conflict.currentVersion }}</span><p *ngFor="let item of latestItems">{{ item.type }} · {{ item.frequency }} · 处置V{{ item.dispositionVersion }}</p></div>
              <div><span>您的草稿（基于V{{ conflict.baseVersion }}）</span><p *ngFor="let item of rows">{{ item.type }} · {{ item.frequency }} · 处置V{{ item.dispositionVersion }}</p></div>
            </div>
            <div class="actions">
              <button mat-button (click)="adoptCurrent()">以先发布版本刷新草稿</button>
              <button mat-flat-button color="primary" (click)="confirmPublish()">已对照，重新确认并发布 V{{ conflict.currentVersion + 1 }}</button>
            </div>
          </div>
        </div>

        <div class="panel history">
          <h3>{{ zone }} · 已发布版本（旧→新）</h3>
          <article *ngFor="let v of history; let last = last" [class.current]="last">
            <div class="v-head"><b>V{{ v.version }}</b><span class="cur" *ngIf="last">当前执行</span></div>
            <p class="remark">{{ v.remark }}</p>
            <p *ngFor="let item of v.items" class="item">{{ item.type }}：{{ item.frequency }} · 处置依据V{{ item.dispositionVersion }}</p>
            <small>{{ v.publishedBy }} · {{ v.publishedAt.replace('T', ' ').slice(0, 16) }}</small>
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 14px; gap: 20px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; max-width: 820px; }
    .split { display: grid; grid-template-columns: minmax(560px,1fr) 380px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; }.editor { padding: 16px; }
    .editor-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e1e6e5; padding-bottom: 10px; margin-bottom: 12px; }.editor-head b { font-size: 14px; }.editor-head small { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.tag { background: #eef4f2; color: #2e675a; font-size: 10px; padding: 4px 8px; white-space: nowrap; }
    .rows { display: grid; gap: 8px; }.rows article { display: grid; grid-template-columns: 48px 1fr 150px 90px; gap: 10px; align-items: center; background: #f7f9f8; padding: 8px 10px; }.rows article b { color: #245060; font-size: 12px; }.rows small { color: #8a9793; font-size: 10px; }.rows .mat-mdc-form-field { margin: 0; }
    .wide { width: 100%; margin-top: 8px; }.actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
    .conflict { margin-top: 16px; border: 1px solid #e0b94f; background: #fdf7e7; padding: 13px; }.conflict h3 { margin: 0 0 6px; color: #8e681d; font-size: 14px; }.conflict > p { font-size: 12px; color: #6c5d38; margin: 0 0 10px; }.conflict-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }.conflict-grid div { background: white; padding: 9px; border: 1px solid #e7d9ae; }.conflict-grid span { display: block; font-weight: 600; font-size: 11px; color: #8e681d; margin-bottom: 5px; }.conflict-grid p { margin: 2px 0; font-size: 11px; color: #40514d; }
    .history { padding: 14px; max-height: 640px; overflow: auto; }.history h3 { margin: 0 0 10px; font-size: 14px; }.history article { border-left: 3px solid #c3d0cc; padding: 8px 10px; margin-bottom: 9px; background: #f7f9f8; }.history article.current { border-left-color: #2f6f86; background: #eef5f4; }.v-head { display: flex; justify-content: space-between; align-items: center; }.v-head b { color: #245060; }.cur { font-size: 10px; color: white; background: #2f6f86; padding: 2px 6px; }.remark { margin: 5px 0; font-size: 11px; color: #5b6b67; }.item { margin: 1px 0; font-size: 11px; color: #40514d; }.history small { color: #8a9793; font-size: 10px; }
  `]
})
export class PlansPageComponent {
  private readonly store = inject(Store)
  private dataset: TailingsDataset = { points: [], thresholds: [], readings: [], anomalies: [], audit: [], planVersions: [] }
  zone = '主坝'
  zones: string[] = []
  history: TailingsDataset['planVersions'] = []
  draft?: PlanDraft
  conflict: PlanConflict | null = null
  rows: PlanItem[] = []
  remark = ''
  baseVersion = 0
  latestItems: PlanItem[] = []
  private draftPresent = false
  readonly types: MonitoringType[] = ['位移', '水位', '渗流', '降雨']

  constructor() {
    combineLatest([
      this.store.select(selectDataset),
      this.store.select(selectSelectedZone),
      this.store.select(selectDrafts),
      this.store.select(selectZonePlanVersions),
      this.store.select(selectPlanConflict)
    ]).subscribe(([dataset, zone, drafts, history, conflict]) => {
      this.dataset = dataset
      this.zones = [...new Set(dataset.points.map((point) => point.zone))]
      this.history = history
      this.conflict = conflict
      const zoneChanged = zone !== this.zone || !this.rows.length
      this.zone = zone
      this.draft = drafts[zone]
      this.latestItems = latestPlanVersion(dataset.planVersions, zone)?.items ?? []
      // 重载表单：切换分区 / 首次进入 / 草稿被发布清除 / 草稿基准被"刷新草稿"更新
      const draftCleared = this.draftPresent && !this.draft
      const latest = latestPlanVersion(dataset.planVersions, zone)
      const effectiveBase = this.draft?.baseVersion ?? latest?.version ?? 0
      const baseMoved = effectiveBase !== this.baseVersion
      if (zoneChanged || draftCleared || baseMoved) this.loadForm()
      this.draftPresent = !!this.draft
    })
  }

  private loadForm(): void {
    const latest = latestPlanVersion(this.dataset.planVersions, this.zone)
    const source = this.draft ?? latest
    this.baseVersion = this.draft?.baseVersion ?? latest?.version ?? 0
    this.rows = source ? cloneItems(source.items) : this.types.map((type) => ({ type, frequency: '', thresholdVersion: 0, dispositionVersion: 0 }))
    this.remark = this.draft?.remark ?? source?.remark ?? ''
  }

  changeZone(zone: string): void {
    this.rows = []
    this.draftPresent = false
    this.store.dispatch(TailingsActions.selectZone({ zone }))
  }

  saveDraft(): void {
    const draft: PlanDraft = {
      zone: this.zone,
      baseVersion: this.baseVersion,
      items: cloneItems(this.rows),
      remark: this.remark,
      updatedBy: '当前用户',
      updatedAt: new Date().toISOString()
    }
    this.store.dispatch(TailingsActions.savePlanDraft({ draft }))
  }

  publish(): void {
    this.saveDraft()
    this.store.dispatch(TailingsActions.publishPlan({ zone: this.zone, publisher: '负责人 何清', baseVersion: this.baseVersion, note: this.remark }))
  }

  /** 演示用：另一位负责人在同一分区抢先发布，使当前草稿基准过期并触发版本冲突 */
  simulateEarlierPublish(): void {
    this.saveDraft()
    this.store.dispatch(TailingsActions.externalPublishPlan({ zone: this.zone, publisher: '值班负责人 周岩', note: `${this.zone}值班负责人抢先发布的汛前加密调整` }))
  }

  adoptCurrent(): void {
    const latest = latestPlanVersion(this.dataset.planVersions, this.zone)
    if (!latest) return
    this.store.dispatch(TailingsActions.savePlanDraft({
      draft: { zone: this.zone, baseVersion: latest.version, items: cloneItems(latest.items), remark: latest.remark, updatedBy: '当前用户', updatedAt: new Date().toISOString() }
    }))
  }

  confirmPublish(): void {
    this.saveDraft()
    this.store.dispatch(TailingsActions.confirmPublishPlan({ zone: this.zone, publisher: '当前用户（负责人）', note: this.remark }))
  }
}
