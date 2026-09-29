import { CommonModule } from '@angular/common'
import { Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { combineLatest } from 'rxjs'
import type { MonitoringPlanItem, MonitoringType, PlanChangeScope } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import {
  selectPublishConflict,
  selectSelectedPlanZone,
  selectZones,
  selectZoneDraft,
  selectZoneLatestPlan,
  selectZonePlanHistory
} from '../store/tailings.selectors'

interface DraftItemForm {
  type: MonitoringType
  frequency: string
  dispositionBasis: string
}

const ALL_TYPES: MonitoringType[] = ['位移', '水位', '渗流', '降雨']

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head">
        <div><h2>分区监测计划版本</h2><p>汛期前调整先草拟、再由负责人发布；同一分区后发布者必须看到版本冲突并重新确认，已发布版本永不被覆盖。异常进入现场复核时按发布版冻结监测类型、频率与处置版本。</p></div>
        <mat-form-field appearance="outline"><mat-label>分区</mat-label><mat-select [ngModel]="zone$ | async" (ngModelChange)="changeZone($event)"><mat-option *ngFor="let item of zones$ | async" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field>
      </div>

      <div class="conflict" *ngIf="conflict$ | async as conflict">
        <div class="conflict-title"><b>发布版本冲突：{{ conflict.zone }}</b><span>你的草稿基于 V{{ conflict.draftBasedOnVersion }}，但 V{{ conflict.latestVersion }} 已由 {{ conflict.latestPublishedBy }} 于 {{ conflict.latestPublishedAt.replace('T', ' ').slice(0, 16) }} 先发布：“{{ conflict.latestReason }}”</span></div>
        <p>系统已拦截本次发布，先发布的调整不会被覆盖。请比对后重新确认：确认将在 V{{ conflict.latestVersion }} 之上另出新版本；也可以放弃草稿，按最新版重新草拟。</p>
        <div class="conflict-actions">
          <button mat-flat-button color="primary" (click)="confirmPublish(conflict.planId)">我已比对，仍按草稿内容发布为新版本</button>
          <button mat-button (click)="discardDraft(conflict.zone)">放弃草稿，改用 V{{ conflict.latestVersion }} 重新草拟</button>
          <button mat-button (click)="dismiss()">暂不处理</button>
        </div>
      </div>

      <div class="split">
        <div class="panel history">
          <h3>版本历史（{{ zone$ | async }}）</h3>
          <table mat-table [dataSource]="history$ | async">
            <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row"><b [class.draft]="row.status === '草稿'">{{ row.status === '草稿' ? '草稿（基于V' + row.basedOnVersion + '）' : 'V' + row.version }}</b></td></ng-container>
            <ng-container matColumnDef="scope"><th mat-header-cell *matHeaderCellDef>调整类型</th><td mat-cell *matCellDef="let row">{{ row.changeScope }}<small class="sub">{{ row.reason }}</small></td></ng-container>
            <ng-container matColumnDef="items"><th mat-header-cell *matHeaderCellDef>监测类型 / 频率 / 处置依据</th><td mat-cell *matCellDef="let row"><div class="item" *ngFor="let item of row.items"><b>{{ item.type }}</b><span>{{ item.frequency }}</span><small>{{ item.dispositionBasis }}</small></div></td></ng-container>
            <ng-container matColumnDef="publisher"><th mat-header-cell *matHeaderCellDef>草拟 / 发布</th><td mat-cell *matCellDef="let row"><span>{{ row.draftedBy }}</span><small class="sub">{{ row.draftedAt.replace('T', ' ').slice(0, 16) }}</small><span *ngIf="row.publishedBy">{{ row.publishedBy }} · {{ row.publishedAt.replace('T', ' ').slice(0, 16) }}</span></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="historyColumns"></tr><tr mat-row *matRowDef="let row; columns: historyColumns" [class.draft-row]="row.status === '草稿'"></tr>
          </table>
        </div>

        <div class="panel editor">
          <h3>计划草拟</h3>
          <p class="hint">基于版本：<b>{{ basedOnText }}</b>。保存草稿不影响现场；负责人发布后，正在复核的异常仍认其冻结的旧版本。</p>
          <mat-form-field appearance="outline" class="full"><mat-label>调整类型</mat-label><mat-select [(ngModel)]="changeScope"><mat-option value="日常">日常</mat-option><mat-option value="汛期前调整">汛期前调整</mat-option></mat-select></mat-form-field>
          <mat-form-field appearance="outline" class="full"><mat-label>调整原因</mat-label><textarea matInput rows="2" [(ngModel)]="reason"></textarea></mat-form-field>
          <div class="items" *ngFor="let item of items; let i = index">
            <mat-form-field appearance="outline"><mat-label>监测类型</mat-label><mat-select [(ngModel)]="item.type"><mat-option *ngFor="let type of types" [value]="type">{{ type }}</mat-option></mat-select></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>频率</mat-label><input matInput [(ngModel)]="item.frequency" placeholder="每2小时1次" /></mat-form-field>
            <mat-form-field appearance="outline" class="grow"><mat-label>处置依据</mat-label><input matInput [(ngModel)]="item.dispositionBasis" placeholder="阈值/速率与处置触发条件" /></mat-form-field>
            <button mat-icon-button class="remove" (click)="removeItem(i)" aria-label="删除监测项">✕</button>
          </div>
          <button mat-button class="add" (click)="addItem()">+ 增加监测项</button>
          <div class="editor-actions">
            <button mat-flat-button color="primary" (click)="saveDraft()">保存草稿</button>
            <button mat-flat-button [color]="draftId ? 'accent' : undefined" [disabled]="!draftId" (click)="publish()">负责人发布{{ draftId ? '' : '（需先保存草稿）' }}</button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; max-width: 820px; }
    .conflict { background: #fae8e6; border-left: 4px solid #a23b34; padding: 13px 16px; margin-bottom: 14px; }.conflict-title { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }.conflict-title b { color: #8c2f29; font-size: 14px; }.conflict-title span { color: #6e4d4a; font-size: 12px; }.conflict p { margin: 7px 0 9px; font-size: 12px; color: #745b58; }.conflict-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .split { display: grid; grid-template-columns: minmax(560px, 1fr) 480px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; }.panel h3 { font-size: 14px; margin: 0; padding: 14px 16px 8px; }.history table { width: 100%; }.draft-row { background: #fbf6e7; }.sub { display: block; color: #8a9491; font-size: 10px; margin-top: 2px; }.item { display: grid; gap: 2px; padding: 3px 0; }.item b { font-size: 12px; }.item span { font-size: 11px; color: #245060; }.item small { font-size: 10px; color: #7c8986; }
    .editor { padding: 0 16px 16px; }.hint { font-size: 11px; color: #72807d; margin: 0 0 10px; }.full { width: 100%; }.items { display: grid; grid-template-columns: 110px 130px 1fr 30px; gap: 8px; align-items: center; }.grow { min-width: 0; }.remove { color: #a23b34; font-size: 12px; }.add { color: #245060; font-size: 12px; }.editor-actions { display: flex; gap: 10px; margin-top: 12px; }
  `]
})
export class PlansPageComponent {
  private readonly store = inject(Store)
  private readonly destroyRef = inject(DestroyRef)
  readonly zones$ = this.store.select(selectZones)
  readonly zone$ = this.store.select(selectSelectedPlanZone)
  readonly history$ = this.store.select(selectZonePlanHistory)
  readonly draft$ = this.store.select(selectZoneDraft)
  readonly latest$ = this.store.select(selectZoneLatestPlan)
  readonly conflict$ = this.store.select(selectPublishConflict)
  readonly historyColumns = ['version', 'scope', 'items', 'publisher']
  readonly types = ALL_TYPES

  draftId = ''
  basedOnText = '—'
  changeScope: PlanChangeScope = '汛期前调整'
  reason = ''
  items: DraftItemForm[] = []
  private signature = ''

  constructor() {
    combineLatest([this.zone$, this.draft$, this.latest$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([zone, draft, latest]) => {
        const nextSignature = `${zone}|${draft?.id ?? ''}|${latest?.id ?? ''}`
        if (nextSignature === this.signature) return
        this.signature = nextSignature
        if (draft) {
          this.draftId = draft.id
          this.changeScope = draft.changeScope
          this.reason = draft.reason
          this.items = structuredClone(draft.items)
          this.basedOnText = `${zone} V${draft.basedOnVersion}（草稿）`
        } else if (latest) {
          this.draftId = ''
          this.changeScope = '汛期前调整'
          this.reason = ''
          this.items = latest.items.map((item) => ({ ...item }))
          this.basedOnText = `${zone} V${latest.version}（最新已发布，新草稿将基于此版）`
        } else {
          this.draftId = ''
          this.reason = ''
          this.items = []
          this.basedOnText = `${zone} 尚无已发布版本，新草稿基于 V0`
        }
      })
  }

  changeZone(zone: string): void {
    this.store.dispatch(TailingsActions.selectPlanZone({ zone }))
  }

  addItem(): void {
    const used = new Set(this.items.map((item) => item.type))
    const nextType = ALL_TYPES.find((type) => !used.has(type)) ?? '位移'
    this.items.push({ type: nextType, frequency: '', dispositionBasis: '' })
  }

  removeItem(index: number): void {
    this.items.splice(index, 1)
  }

  private cleanItems(): MonitoringPlanItem[] {
    return this.items
      .filter((item) => item.frequency.trim() || item.dispositionBasis.trim())
      .map((item) => ({ type: item.type, frequency: item.frequency.trim(), dispositionBasis: item.dispositionBasis.trim() }))
  }

  saveDraft(): void {
    const items = this.cleanItems()
    if (!this.reason.trim() || items.length === 0) return
    this.store.select(selectSelectedPlanZone).subscribe((zone) => {
      this.store.dispatch(TailingsActions.savePlanDraft({ zone, changeScope: this.changeScope, reason: this.reason.trim(), items, operator: '安全科 高岚' }))
    }).unsubscribe()
  }

  publish(): void {
    if (!this.draftId) return
    this.store.dispatch(TailingsActions.publishPlan({ planId: this.draftId, publisher: '负责人 何清' }))
  }

  confirmPublish(planId: string): void {
    this.store.dispatch(TailingsActions.confirmPublishPlan({ planId, publisher: '负责人 何清' }))
  }

  discardDraft(zone: string): void {
    this.store.dispatch(TailingsActions.discardPlanDraft({ zone }))
  }

  dismiss(): void {
    this.store.dispatch(TailingsActions.dismissPublishConflict())
  }
}
