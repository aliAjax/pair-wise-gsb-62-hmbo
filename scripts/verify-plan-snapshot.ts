import assert from 'node:assert'
import {
  buildSnapshot,
  latestPlanVersion,
  latestPlanVersionAt,
  migratePlanSnapshots
} from '../apps/tailings-monitor/src/app/domain/plan'
import { seedDataset } from '../apps/tailings-monitor/src/app/data/seed'
import type { TailingsDataset } from '../apps/tailings-monitor/src/app/domain'

// 1) 升级迁移：升级前已进入处置的异常按打开时最新版本补齐
const migrated = migratePlanSnapshots(structuredClone(seedDataset))
const an01 = migrated.anomalies.find((a) => a.id === 'AN-260929-01')!
const an02 = migrated.anomalies.find((a) => a.id === 'AN-260929-02')!
const an03 = migrated.anomalies.find((a) => a.id === 'AN-260929-03')!
assert.equal(an01.planSnapshot?.source, 'backfilled', 'AN-01 应为升级前补齐')
assert.equal(an01.planSnapshot.planVersion, 2, 'AN-01 打开时主坝最新版本应为 V2')
assert.equal(an01.planSnapshot.items[0].frequency, '每2小时1次', '补齐快照保存频率')
assert.equal(an01.planSnapshot.items[0].dispositionVersion, 4, '补齐快照保存处置版本')
assert.equal(an01.planSnapshot.triggerReadingId, 'RD-1', '快照关联原始读数')
assert.equal(an02.planSnapshot?.source, 'backfilled', 'AN-02 应为升级前补齐')
assert.equal(an02.planSnapshot.planVersion, 1, 'AN-02 打开时库区只有 V1')
assert.ok(!an03.planSnapshot, 'AN-03 升级后新开、未进入复核，不应补齐')

// 2) 幂等：再次迁移不重复审计、不改快照
const auditBefore = migrated.audit.length
const again = migratePlanSnapshots(structuredClone(migrated))
assert.equal(again.audit.length, auditBefore, '重复迁移不应追加审计')
assert.deepEqual(again.anomalies.map((a) => [a.id, a.planSnapshot?.planVersion, a.planSnapshot?.source]),
  migrated.anomalies.map((a) => [a.id, a.planSnapshot?.planVersion, a.planSnapshot?.source]))

// 3) 审计记录存在且描述版本对应
const backfillAudit = migrated.audit.find((e) => e.id === 'AUD-BACKFILL-AN-260929-01')
assert.ok(backfillAudit, '应存在补齐审计')
assert.ok(backfillAudit.detail.includes('V2'))

// 4) latestPlanVersionAt 时间边界
assert.equal(latestPlanVersionAt(seedDataset.planVersions, '主坝', '2026-09-25T00:00:00')?.version, 1)
assert.equal(latestPlanVersionAt(seedDataset.planVersions, '主坝', '2026-09-27T00:00:00')?.version, 2)

// 5) 快照冻结后不受后续计划发布影响：模拟主坝再发布 V3
const ds: TailingsDataset = structuredClone(migrated)
const v2 = latestPlanVersion(ds.planVersions, '主坝')!
ds.planVersions.push({
  id: 'MP-主坝-V3', zone: '主坝', version: 3, remark: '进一步加密', publishedBy: '负责人 何清', publishedAt: '2026-09-29T12:00:00',
  items: v2.items.map((i) => ({ ...i, frequency: '每1小时1次', dispositionVersion: 6 }))
})
// 冻结的快照仍是 V2 内容
const frozen = buildSnapshot(v2, 'RD-1', 'pinned', '2026-09-29T09:30:00')
assert.equal(frozen.planVersion, 2)
assert.equal(frozen.items[0].frequency, '每2小时1次')
assert.equal(latestPlanVersion(ds.planVersions, '主坝')?.version, 3, '当前最新已是 V3，但冻结快照仍认 V2')

// 6) 已关闭异常不被迁移/改写逻辑触碰（构造关闭态）
an01.status = '已关闭'
an01.closedAt = '2026-09-29T13:00:00'
const afterClosed = migratePlanSnapshots(structuredClone({ ...migrated, anomalies: [an01, an02, an03] }))
const closed = afterClosed.anomalies.find((a) => a.id === 'AN-260929-01')!
assert.equal(closed.status, '已关闭')
assert.equal(closed.planSnapshot.planVersion, 2, '关闭记录保留原冻结版本')

console.log('OK: 所有计划快照/迁移/版本冻结断言通过')
