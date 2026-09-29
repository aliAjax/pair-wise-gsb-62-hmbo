import type { TailingsDataset } from '../domain'

export const seedDataset: TailingsDataset = {
  points: [
    { id: 'P-D01', name: '主坝顶部位移点 D01', zone: '主坝', type: '位移', longitude: 112.832, latitude: 40.116, status: '异常', currentValue: 18.7, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:20:00' },
    { id: 'P-D02', name: '主坝下游位移点 D02', zone: '主坝', type: '位移', longitude: 112.837, latitude: 40.111, status: '预警', currentValue: 12.4, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:10:00' },
    { id: 'P-W01', name: '库内水位计 W01', zone: '库区', type: '水位', longitude: 112.846, latitude: 40.121, status: '预警', currentValue: 873.4, unit: 'm', thresholdId: 'T-W', lastInspectionAt: '2026-09-29T07:55:00' },
    { id: 'P-S01', name: '主坝渗流计 S01', zone: '主坝', type: '渗流', longitude: 112.827, latitude: 40.106, status: '正常', currentValue: 1.8, unit: 'L/s', thresholdId: 'T-S', lastInspectionAt: '2026-09-29T07:40:00' },
    { id: 'P-R01', name: '库区雨量站 R01', zone: '库区', type: '降雨', longitude: 112.861, latitude: 40.132, status: '正常', currentValue: 24.6, unit: 'mm/h', thresholdId: 'T-R', lastInspectionAt: '2026-09-29T08:00:00' }
  ],
  thresholds: [
    { id: 'T-D', type: '位移', warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', enabled: true, version: 4 },
    { id: 'T-W', type: '水位', warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', enabled: true, version: 3 },
    { id: 'T-S', type: '渗流', warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', enabled: true, version: 5 },
    { id: 'T-R', type: '降雨', warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', enabled: true, version: 2 }
  ],
  readings: [
    { id: 'RD-1', pointId: 'P-D01', value: 18.7, unit: 'mm', capturedAt: '2026-09-29T08:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-2', pointId: 'P-D01', value: 16.2, unit: 'mm', capturedAt: '2026-09-29T07:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-3', pointId: 'P-D01', value: 13.8, unit: 'mm', capturedAt: '2026-09-29T06:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-4', pointId: 'P-W01', value: 873.4, unit: 'm', capturedAt: '2026-09-29T07:55:00', deviceId: 'WL-W01', quality: '有效' },
    { id: 'RD-5', pointId: 'P-S01', value: 1.8, unit: 'L/s', capturedAt: '2026-09-20T16:30:00', deviceId: 'SE-S01', quality: '有效' },
    { id: 'RD-6', pointId: 'P-S01', value: 1.6, unit: 'L/s', capturedAt: '2026-09-21T09:00:00', deviceId: 'SE-S01', quality: '有效' }
  ],
  plans: [
    {
      id: 'MP-ZB-V1', zone: '主坝', version: 1, status: '已发布', changeScope: '日常',
      reason: '常规运行期监测安排',
      items: [
        { type: '位移', frequency: '每日1次', dispositionBasis: '位移报警16mm、速率3mm/d' },
        { type: '渗流', frequency: '每日2次', dispositionBasis: '渗流报警3L/s' }
      ],
      basedOnVersion: 0, draftedBy: '安全科 高岚', draftedAt: '2026-08-28T10:00:00', publishedBy: '负责人 何清', publishedAt: '2026-08-29T09:30:00'
    },
    {
      id: 'MP-ZB-V2', zone: '主坝', version: 2, status: '已发布', changeScope: '汛期前调整',
      reason: '汛期前加密坝体位移与渗流监测，明确降低库水位处置条件',
      items: [
        { type: '位移', frequency: '每4小时1次', dispositionBasis: '位移报警16mm；速率连续2次超3mm/d即降低库水位' },
        { type: '渗流', frequency: '每2小时1次', dispositionBasis: '渗流报警3L/s，超2.2L/s预警加密' }
      ],
      basedOnVersion: 1, draftedBy: '安全科 高岚', draftedAt: '2026-09-25T14:00:00', publishedBy: '负责人 何清', publishedAt: '2026-09-26T09:00:00'
    },
    {
      id: 'MP-ZB-V3', zone: '主坝', version: 3, status: '已发布', changeScope: '汛期前调整',
      reason: '响应上游持续降雨预报，坝顶位移进一步加密',
      items: [
        { type: '位移', frequency: '每2小时1次', dispositionBasis: '位移报警16mm；速率超3mm/d即降低库水位并复测' },
        { type: '渗流', frequency: '每1小时1次', dispositionBasis: '渗流报警3L/s，超2.2L/s预警加密' }
      ],
      basedOnVersion: 2, draftedBy: '坝体安全组 宋立', draftedAt: '2026-09-28T11:00:00', publishedBy: '值班负责人 陈炬', publishedAt: '2026-09-28T16:00:00'
    },
    {
      id: 'MP-ZB-DRAFT', zone: '主坝', version: 0, status: '草稿', changeScope: '汛期前调整',
      reason: '（旧草稿）按V2经验拟将位移改为每3小时1次——发布时将与已发布的V3冲突',
      items: [
        { type: '位移', frequency: '每3小时1次', dispositionBasis: '按V2处置：速率连续2次超3mm/d降低库水位' },
        { type: '渗流', frequency: '每2小时1次', dispositionBasis: '渗流报警3L/s' }
      ],
      basedOnVersion: 2, draftedBy: '安全科 高岚', draftedAt: '2026-09-28T10:00:00', publishedBy: '', publishedAt: ''
    },
    {
      id: 'MP-KQ-V1', zone: '库区', version: 1, status: '已发布', changeScope: '日常',
      reason: '常规水情监测安排',
      items: [
        { type: '水位', frequency: '每2小时1次', dispositionBasis: '水位预警871m、报警873m' },
        { type: '降雨', frequency: '每1小时1次', dispositionBasis: '雨强30mm/h预警、50mm/h报警' }
      ],
      basedOnVersion: 0, draftedBy: '调度班 许洁', draftedAt: '2026-08-28T10:00:00', publishedBy: '负责人 何清', publishedAt: '2026-08-29T09:35:00'
    },
    {
      id: 'MP-KQ-V2', zone: '库区', version: 2, status: '已发布', changeScope: '汛期前调整',
      reason: '汛期前加密水位与雨强监测，874m启动应急联动',
      items: [
        { type: '水位', frequency: '每30分钟1次', dispositionBasis: '水位报警873m；到874m启动应急联动' },
        { type: '降雨', frequency: '每15分钟1次', dispositionBasis: '雨强30mm/h预警、50mm/h报警' }
      ],
      basedOnVersion: 1, draftedBy: '调度班 许洁', draftedAt: '2026-09-25T15:00:00', publishedBy: '负责人 何清', publishedAt: '2026-09-26T09:10:00'
    }
  ],
  anomalies: [
    {
      id: 'AN-260929-01', pointId: 'P-D01', title: '主坝D01累计位移超过报警阈值', severity: '重大', status: '待负责人审批', openedAt: '2026-09-29T08:25:00', owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '18.7 mm，昨日变化4.2 mm/d', version: 7, closedAt: '',
      fieldReviews: [{ id: 'FR-1', inspector: '宋立', arrivedAt: '2026-09-29T09:10:00', observed: '坝顶排水沟未见明显开裂，D01附近无新增裂缝，基准点稳定。', evidence: 'D01近景照片、基准点复核记录、GNSS原始观测文件', reassessment: '读数有效，位移趋势仍上升，建议立即降低库水位并加密监测。', version: 1 }],
      retests: [
        { id: 'RT-1', planVersion: 3, frequency: '每2小时1次', value: 17.9, unit: 'mm', inspector: '宋立', conclusion: '较触发值回落0.8mm，速率仍接近阈值，维持降低库水位。', measuredAt: '2026-09-29T10:20:00' }
      ],
      opinions: [
        { id: 'OP-1', specialist: '周岩', discipline: '岩土', content: '近三日位移速率持续高于阈值，需结合孔隙水压力分析潜在滑面。', conclusion: '支持结论', createdAt: '2026-09-29T10:20:00' },
        { id: 'OP-2', specialist: '许洁', discipline: '水文', content: '库水位仍接近警戒线，建议优先降低库水位并核对上游来水。', conclusion: '补充证据', createdAt: '2026-09-29T10:45:00' }
      ],
      plan: { id: 'PL-1', action: '降低库水位', owner: '库区调度班', deadline: '2026-09-29T18:00:00', conditions: '按主坝V3计划每2小时复测D01、D02；位移速率恢复至3mm/d以下并稳定12小时后，负责人可关闭异常。', emergencyLinked: true, approvedBy: '', approvedAt: '' },
      planSnapshot: {
        planId: 'MP-ZB-V3', zone: '主坝', version: 3, type: '位移', frequency: '每2小时1次',
        dispositionBasis: '位移报警16mm；速率超3mm/d即降低库水位并复测', dispositionVersion: 3,
        publishedBy: '值班负责人 陈炬', publishedAt: '2026-09-28T16:00:00', source: '发布版', backfilledAt: '', frozenAt: '2026-09-29T09:10:00'
      }
    },
    {
      // 升级前打开、无计划快照的异常：首次在界面打开时按当时最新已发布版本补齐
      id: 'AN-260929-02', pointId: 'P-W01', title: '库水位短时上升速率超预警值', severity: '较高', status: '原因调查中', openedAt: '2026-09-29T08:00:00', owner: '库区调度班', triggerReadingId: 'RD-4', observedValue: '873.4 m，1小时上升0.6 m', version: 4, closedAt: '',
      fieldReviews: [], retests: [],
      opinions: [{ id: 'OP-3', specialist: '许洁', discipline: '水文', content: '上游降雨汇流导致入湖量增加，需核实泄洪闸状态。', conclusion: '支持结论', createdAt: '2026-09-29T09:00:00' }],
      plan: { id: 'PL-2', action: '加密监测', owner: '库区调度班', deadline: '2026-09-29T14:00:00', conditions: '每小时记录水位与入库流量，达到874.0m时启动应急联动。', emergencyLinked: false, approvedBy: '', approvedAt: '' },
      planSnapshot: null
    },
    {
      // 升级前已关闭的老异常：快照缺失但永不再改写，界面标注“升级前记录”
      id: 'AN-260920-03', pointId: 'P-S01', title: '主坝S01渗流量短时超预警', severity: '关注', status: '已关闭', openedAt: '2026-09-20T15:40:00', owner: '坝体安全组', triggerReadingId: 'RD-5', observedValue: '1.8 L/s，较前日上升0.5 L/s', version: 6, closedAt: '2026-09-21T11:00:00',
      fieldReviews: [{ id: 'FR-2', inspector: '宋立', arrivedAt: '2026-09-20T16:10:00', observed: '排水棱体出水清澈，无浑浊与管涌迹象，周边无新增渗水点。', evidence: '渗流量观测记录、出水透明度比对照片', reassessment: '读数有效，判断为降雨入渗导致的短时波动，按加密监测复测。', version: 1 }],
      retests: [
        { id: 'RT-2', planVersion: 1, frequency: '每日2次', value: 1.7, unit: 'L/s', inspector: '宋立', conclusion: '渗流量回落，出水清澈，继续观察。', measuredAt: '2026-09-20T22:00:00' },
        { id: 'RT-3', planVersion: 1, frequency: '每日2次', value: 1.6, unit: 'L/s', inspector: '值班员 赵鹏', conclusion: '连续两次回落，关闭条件满足。', measuredAt: '2026-09-21T09:00:00' }
      ],
      opinions: [],
      plan: { id: 'PL-3', action: '加密监测', owner: '坝体安全组', deadline: '2026-09-21T10:00:00', conditions: '加密复测渗流量，连续两次低于2.2L/s且出水清澈后关闭。', emergencyLinked: false, approvedBy: '负责人 何清', approvedAt: '2026-09-20T17:00:00' },
      planSnapshot: null
    }
  ],
  audit: [
    { id: 'A-1', entityId: 'P-D01', action: '生成异常', operator: '阈值引擎', detail: '累计位移18.7mm超过报警阈值16mm', createdAt: '2026-09-29T08:25:00' },
    { id: 'A-2', entityId: 'AN-260929-01', action: '提交现场复核', operator: '宋立', detail: '冻结监测计划 主坝 V3（位移 每2小时1次，处置版本V3）；原始读数有效，位移趋势仍上升', createdAt: '2026-09-29T09:25:00' },
    { id: 'A-3', entityId: 'AN-260929-01', action: '补充专业意见', operator: '周岩', detail: '建议结合孔隙水压力分析潜在滑面', createdAt: '2026-09-29T10:20:00' },
    { id: 'A-4', entityId: 'MP-ZB-V3', action: '发布监测计划', operator: '值班负责人 陈炬', detail: '主坝 V3 汛期前调整发布：位移每2小时1次、渗流每1小时1次', createdAt: '2026-09-28T16:00:00' },
    { id: 'A-5', entityId: 'AN-260920-03', action: '关闭异常', operator: '负责人 何清', detail: '复测渗流量连续回落至1.6L/s，关闭条件满足（升级前记录，无计划快照，不再补齐）', createdAt: '2026-09-21T11:00:00' }
  ]
}
