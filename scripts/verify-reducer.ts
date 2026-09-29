import assert from 'node:assert'
import { TailingsActions } from '../apps/tailings-monitor/src/app/store/tailings.actions'
import { initialTailingsState, tailingsReducer, type TailingsState } from '../apps/tailings-monitor/src/app/store/tailings.reducer'
import type { PlanDraft } from '../apps/tailings-monitor/src/app/domain'

let state: TailingsState = structuredClone(initialTailingsState)

const draftA = (base: number, freq: string, v: number): PlanDraft => ({
  zone: '主坝', baseVersion: base, remark: '甲方汛前调整', updatedBy: '用户A', updatedAt: '2026-09-29T11:00:00',
  items: [
    { type: '位移', frequency: freq, thresholdVersion: 4, dispositionVersion: v },
    { type: '水位', frequency: '逐小时', thresholdVersion: 3, dispositionVersion: 3 },
    { type: '渗流', frequency: '每4小时1次', thresholdVersion: 5, dispositionVersion: 5 },
    { type: '降雨', frequency: '逐小时', thresholdVersion: 2, dispositionVersion: 2 }
  ]
})

// A 先保存基于 V2 的草稿
state = tailingsReducer(state, TailingsActions.savePlanDraft({ draft: draftA(2, '每2小时1次', 4) }))
assert.equal(state.drafts['主坝']?.baseVersion, 2)

// B 在 A 不知情的情况下抢先发布 V3
state = tailingsReducer(state, TailingsActions.externalPublishPlan({ zone: '主坝', publisher: '负责人B', note: '乙方加密' }))
assert.equal(state.dataset.planVersions.filter((p) => p.zone === '主坝').at(-1)?.version, 3)
assert.ok(state.drafts['主坝'], 'A 的草稿仍在，未被 B 的发布清除')

// A 基于过期 V2 尝试发布：必须冲突，不产生 V4
state = tailingsReducer(state, TailingsActions.publishPlan({ zone: '主坝', publisher: '负责人A', baseVersion: 2, note: '甲方发布' }))
assert.ok(state.conflict, '应出现版本冲突')
assert.equal(state.conflict?.currentVersion, 3)
assert.equal(state.conflict?.baseVersion, 2)
assert.equal(state.dataset.planVersions.filter((p) => p.zone === '主坝').at(-1)?.version, 3, '冲突时不得覆盖、不得追加版本')
assert.ok(state.dataset.audit[0].action.includes('冲突'))

// A 重新确认后发布 -> 在 V3 之后追加 V4，V3 保留
state = tailingsReducer(state, TailingsActions.confirmPublishPlan({ zone: '主坝', publisher: '负责人A', note: '甲方已对照后发布' }))
assert.equal(state.conflict, null)
const versions = state.dataset.planVersions.filter((p) => p.zone === '主坝').map((p) => p.version)
assert.deepEqual(versions, [1, 2, 3, 4], 'V3 先发布保留，A 的调整成为 V4')
assert.equal(state.dataset.planVersions.filter((p) => p.zone === '主坝').at(-1)?.items[0].frequency, '每2小时1次', 'V4 是 A 的内容')
assert.ok(!state.drafts['主坝'], '发布后草稿清除')

// 正常串行发布不会冲突
state = tailingsReducer(state, TailingsActions.savePlanDraft({ draft: draftA(4, '每1小时1次', 6) }))
state = tailingsReducer(state, TailingsActions.publishPlan({ zone: '主坝', publisher: '负责人A', baseVersion: 4, note: '继续加密' }))
assert.equal(state.conflict, null)
assert.equal(state.dataset.planVersions.filter((p) => p.zone === '主坝').at(-1)?.version, 5)

console.log('OK: 发布乐观锁冲突/重新确认/不覆盖断言通过')

// --- 异常进入复核冻结 + 已关闭不可改写 ---
let s2: TailingsState = structuredClone(initialTailingsState)
const an3 = s2.dataset.anomalies.find((a) => a.id === 'AN-260929-03')!
assert.ok(!an3.planSnapshot, '初始 AN-03 无快照')
s2 = tailingsReducer(s2, TailingsActions.enterFieldReview({ anomalyId: 'AN-260929-03', inspector: '宋立' }))
assert.equal(s2.dataset.anomalies.find((a) => a.id === 'AN-260929-03')!.planSnapshot?.planVersion, 2, '进入复核冻结主坝当前 V2')
assert.equal(s2.dataset.anomalies.find((a) => a.id === 'AN-260929-03')!.planSnapshot?.source, 'pinned')

// 之后主坝发布 V3，异常快照仍为 V2
s2 = tailingsReducer(s2, TailingsActions.savePlanDraft({ draft: draftA(2, '每1小时1次', 6) }))
s2 = tailingsReducer(s2, TailingsActions.publishPlan({ zone: '主坝', publisher: '负责人 何清', baseVersion: 2, note: '进一步加密' }))
assert.equal(s2.dataset.anomalies.find((a) => a.id === 'AN-260929-03')!.planSnapshot?.planVersion, 2, '复测继续认冻结版 V2')

// 未进入复核不能提交复核；AN-03 已冻结可以提交
s2 = tailingsReducer(s2, TailingsActions.submitFieldReview({
  anomalyId: 'AN-260929-03',
  review: { id: 'FR-x', inspector: '宋立', arrivedAt: '2026-09-29T10:00:00', observed: '渗水量稳定', evidence: '照片', reassessment: '继续观察', version: 1 }
}))
assert.equal(s2.dataset.anomalies.find((a) => a.id === 'AN-260929-03')!.status, '原因调查中')

// 已关闭异常：构造关闭后任何修改 action 均无效
let closed = structuredClone(initialTailingsState)
const target = closed.dataset.anomalies.find((a) => a.id === 'AN-260929-01')!
target.status = '已关闭'; target.closedAt = '2026-09-29T13:00:00'
const frozen = JSON.stringify(target)
closed = tailingsReducer(closed, TailingsActions.addExpertOpinion({ anomalyId: 'AN-260929-01', opinion: { id: 'op-z', specialist: 'X', discipline: '坝体', content: '试图改已关闭', conclusion: '提出异议', createdAt: '2026-09-29T14:00:00' } }))
closed = tailingsReducer(closed, TailingsActions.createEmergencyLink({ anomalyId: 'AN-260929-01', note: '试图联动' }))
closed = tailingsReducer(closed, TailingsActions.submitFieldReview({ anomalyId: 'AN-260929-01', review: { id: 'fr-z', inspector: 'X', arrivedAt: 'x', observed: 'x', evidence: 'x', reassessment: 'x', version: 9 } }))
const after = JSON.stringify(closed.dataset.anomalies.find((a) => a.id === 'AN-260929-01')!)
assert.equal(after, frozen, '已关闭异常的复核/意见/联动都不得改写')

console.log('OK: 进入复核冻结、复测认版、已关闭不可改写断言通过')
