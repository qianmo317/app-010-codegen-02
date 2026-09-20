import { describe, it, expect } from 'vitest';
import {
  createPlan,
  analyzePlan,
  analyzePlotLoad,
  updateNodeDate,
  updateHarvestDate,
  updateGrowthDays,
  addNode,
  removeNode,
  unlockNode,
  nodeName,
  toJdn,
  fromJdn,
  type FarmPlan,
} from './schedule';
import { getActiveTerm, getTermNameOnDate, getSolarTermDatesExact } from './solar-terms';
import { getForbiddenDay } from './farm-rules';

const TODAY = '2026-01-01'; // 固定“今天”，让过期断言不受运行时间影响

function byType(plan: FarmPlan, type: string, label?: string) {
  return plan.nodes.find(n => n.type === type && (label === undefined || n.label === label))!;
}

describe('节气基础数据', () => {
  it('关键节气日期与权威历表一致（北京时间当日）', () => {
    const cases: Array<[number, string, number, number]> = [
      [2024, '立春', 2, 4], [2024, '冬至', 12, 21], [2025, '清明', 4, 4],
      [2025, '芒种', 6, 5], [2025, '秋分', 9, 23], [2050, '立春', 2, 3],
      [1984, '冬至', 12, 22], // 该年交节在北京午夜后，归 22 日
    ];
    for (const [y, name, m, d] of cases) {
      const t = getSolarTermDatesExact(y).find(x => x.name === name)!;
      expect([t.month, t.day]).toEqual([m, d]);
    }
  });

  it('交节当天能识别节气名，交节前后属于相邻节气区间', () => {
    expect(getTermNameOnDate(2024, 2, 4)).toBe('立春');
    expect(getTermNameOnDate(2024, 2, 5)).toBeUndefined();
    expect(getActiveTerm(2024, 2, 4)).toBe('立春');
    expect(getActiveTerm(2024, 2, 18)).toBe('立春');
    expect(getActiveTerm(2024, 2, 19)).toBe('雨水');
  });

  it('能识别四离四绝日（二分二至/四立的前一天）', () => {
    expect(getForbiddenDay(2025, 6, 20).kind).toBe('sili'); // 次日夏至
    expect(getForbiddenDay(2025, 9, 22).kind).toBe('sili'); // 次日秋分
    expect(getForbiddenDay(2025, 5, 4).kind).toBe('sijue'); // 次日立夏
    expect(getForbiddenDay(2025, 6, 19).forbidden).toBe(false);
  });
});

describe('倒推排程', () => {
  it('按采收日与生长天数倒推播种，并生成全部节点、日期升序', () => {
    const plan = createPlan({ plot: '1号地', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const sow = byType(plan, 'sow');
    expect(sow.date).toBe('2025-06-02'); // 9/20 - 110 天
    expect(plan.growthDays).toBe(110);
    for (let i = 1; i < plan.nodes.length; i++) {
      expect(toJdn(plan.nodes[i].date)).toBeGreaterThanOrEqual(toJdn(plan.nodes[i - 1].date));
    }
    // 节点类型覆盖：播种、间苗、追肥、打药、控水、采收
    for (const t of ['sow', 'thin', 'topdress', 'spray', 'waterControl', 'harvest']) {
      expect(plan.nodes.some(n => n.type === t)).toBe(true);
    }
  });
});

describe('节气核对与调整', () => {
  it('播种落在霜期时移到适播窗口交节日并说明原因', () => {
    // 冬小麦 6/10 收、250 天 → 理论播种在上年 10 月初（秋分区间，耐寒作物窗口外）
    const plan = createPlan({ plot: '3号地', cropKey: 'winter-wheat', harvestDate: '2025-06-10' });
    const sow = byType(plan, 'sow');
    expect(sow.date).toBe('2024-10-23'); // 移到霜降交节日
    expect(sow.adjustments[0].reasons.join('')).toContain('霜降');
    expect(sow.adjustments[0].from).not.toBe(sow.date);
  });

  it('非锚节点落在四离日自动提前一天避让，并记录原因', () => {
    // 让播种恰为 2025-06-01（喜温窗口内），追肥播后 19 天 = 6/20（夏至前一日，四离）
    const g = toJdn('2025-09-20') - toJdn('2025-06-01');
    const plan = createPlan({
      plot: 'B', cropKey: 'custom', growthDays: g, harvestDate: '2025-09-20',
      templates: [
        { type: 'sow', base: 'harvest', offsetDays: -g },
        { type: 'topdress', label: '测试肥', base: 'sow', offsetDays: 19 },
        { type: 'harvest', base: 'harvest', offsetDays: 0 },
      ],
    });
    const td = byType(plan, 'topdress', '测试肥');
    expect(td.date).toBe('2025-06-19');
    expect(td.adjustments[0].reasons.join('')).toContain('四离');
  });

  it('采收日落在四离日只提示、不移动用户指定的日子', () => {
    // 2025-12-21 冬至；四离为 12-20。构造采收=12-20
    const g = toJdn('2025-12-20') - toJdn('2025-06-02');
    const plan = createPlan({
      plot: 'C', cropKey: 'custom', hardiness: 'tender', growthDays: g, harvestDate: '2025-12-20',
      templates: [
        { type: 'sow', base: 'harvest', offsetDays: -g },
        { type: 'harvest', base: 'harvest', offsetDays: 0 },
      ],
    });
    expect(byType(plan, 'harvest').date).toBe('2025-12-20');
    const w = analyzePlan(plan, TODAY).find(x => x.code === 'forbidden-harvest');
    expect(w).toBeTruthy();
  });

  it('打药逢小暑大暑给出避开正午的提示', () => {
    const plan = createPlan({ plot: 'D', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const warnings = analyzePlan(plan, TODAY);
    expect(warnings.some(w => w.code === 'heat-spray')).toBe(true);
  });
});

describe('节点告警：过期与挨太近', () => {
  it('日期早于今天的节点单独标为已过期', () => {
    const plan = createPlan({ plot: 'E', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const warnings = analyzePlan(plan, TODAY);
    const past = warnings.filter(w => w.code === 'past');
    expect(past.length).toBe(plan.nodes.length);
  });

  it('相邻两道活间隔不足时提示挨太近', () => {
    const g = toJdn('2025-09-20') - toJdn('2025-06-01');
    const plan = createPlan({
      plot: 'F', cropKey: 'custom', growthDays: g, harvestDate: '2025-09-20',
      templates: [
        { type: 'sow', base: 'harvest', offsetDays: -g },
        { type: 'topdress', label: '一', base: 'sow', offsetDays: 1 },
        { type: 'topdress', label: '二', base: 'sow', offsetDays: 2 },
        { type: 'harvest', base: 'harvest', offsetDays: 0 },
      ],
    });
    const w = analyzePlan(plan, TODAY).find(x => x.code === 'too-close');
    expect(w).toBeTruthy();
    expect(w!.message).toContain('追肥');
  });
});

describe('增删改与连锁重推', () => {
  it('改某个节点日期后，同锚后续节点按原间隔平移、偏移保持自洽', () => {
    const plan = createPlan({ plot: 'G', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const thin = byType(plan, 'thin');
    const before = thin.date;
    const next = updateNodeDate(plan, thin.id, fromJdn(toJdn(before) + 5));

    // 被改节点锁定
    const thin2 = next.nodes.find(n => n.id === thin.id)!;
    expect(thin2.locked).toBe(true);
    expect(toJdn(thin2.date) - toJdn(before)).toBe(5);

    // 同锚（sow）的后续未锁定节点整体后移 5 天
    const m1 = byType(plan, 'topdress', '苗肥');
    const m2 = byType(next, 'topdress', '苗肥');
    expect(toJdn(m2.date) - toJdn(m1.date)).toBe(5);

    // harvest 锚节点（攻穗肥、控水、采收）不动
    expect(byType(next, 'harvest').date).toBe('2025-09-20');
    expect(byType(next, 'topdress', '攻穗肥').date).toBe(byType(plan, 'topdress', '攻穗肥').date);

    // 偏移自洽：date - anchor == offsetDays
    const sow = toJdn(byType(next, 'sow').date);
    const har = toJdn(next.harvestDate);
    for (const n of next.nodes) {
      const anchor = n.base === 'sow' ? sow : har;
      const expectOff = n.type === 'harvest' ? 0 : toJdn(n.date) - anchor;
      expect(n.offsetDays).toBe(expectOff);
    }
  });

  it('锁定的手动节点在改采收日时不被移动', () => {
    const plan = createPlan({ plot: 'H', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const thin = byType(plan, 'thin');
    const pinned = fromJdn(toJdn(thin.date) + 3);
    const edited = updateNodeDate(plan, thin.id, pinned);
    const moved = updateHarvestDate(edited, '2025-10-05');
    const thin2 = moved.nodes.find(n => n.id === thin.id)!;
    expect(thin2.date).toBe(pinned); // 锁定，不跟随
  });

  it('改采收日按生长天数重推播种与全部非锁定后续节点', () => {
    const plan = createPlan({ plot: 'I', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const next = updateHarvestDate(plan, '2025-10-01');
    expect(next.harvestDate).toBe('2025-10-01');
    expect(byType(next, 'sow').date).toBe('2025-06-13'); // 10/1 - 110
    expect(plan.growthDays).toBe(110);
  });

  it('改生长天数后播种日重新倒推，播后节点按新锚重排', () => {
    const plan = createPlan({ plot: 'J', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const next = updateGrowthDays(plan, 120);
    expect(byType(next, 'sow').date).toBe('2025-05-23'); // 9/20 - 120
    expect(next.growthDays).toBe(120);
    // 间苗保持“播后 15 天”
    const thin = byType(next, 'thin');
    expect(toJdn(thin.date) - toJdn(byType(next, 'sow').date)).toBe(15);
  });

  it('新增一道活（指定日期则锁定）并能删除；播种采收不可删', () => {
    const plan = createPlan({ plot: 'K', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const withAdd = addNode(plan, { type: 'other', label: '中耕除草', date: '2025-07-10' });
    const added = withAdd.nodes.find(n => n.label === '中耕除草')!;
    expect(added.manual).toBe(true);
    expect(added.locked).toBe(true);
    const removed = removeNode(withAdd, added.id);
    expect(removed.nodes.some(n => n.id === added.id)).toBe(false);
    // 播种/采收删除被忽略
    const sowId = byType(removed, 'sow').id;
    expect(removeNode(removed, sowId).nodes.some(n => n.id === sowId)).toBe(true);
  });

  it('解锁手动改过的节点后恢复按锚点自动排', () => {
    const plan = createPlan({ plot: 'L', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    const thin = byType(plan, 'thin');
    const edited = updateNodeDate(plan, thin.id, fromJdn(toJdn(thin.date) + 8));
    const unlocked = unlockNode(edited, thin.id);
    const thin2 = unlocked.nodes.find(n => n.id === thin.id)!;
    expect(thin2.locked).toBe(false);
    expect(toJdn(thin2.date) - toJdn(byType(unlocked, 'sow').date)).toBe(15); // 回模板间隔
  });
});

describe('地块当日负载', () => {
  it('同一块地同一天超过两件活给出提示', () => {
    let plan = createPlan({ plot: 'M地', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    plan = addNode(plan, { type: 'other', label: '甲', date: '2025-07-01' });
    plan = addNode(plan, { type: 'spray', label: '乙', date: '2025-07-01' });
    plan = addNode(plan, { type: 'other', label: '丙', date: '2025-07-01' });
    const warnings = analyzePlotLoad([plan]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].count).toBe(3);
    expect(warnings[0].message).toContain('M地');
  });

  it('恰好两件活不提示；不同地块各自统计', () => {
    let a = createPlan({ plot: 'A', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    a = addNode(a, { type: 'other', label: '甲', date: '2025-07-01' });
    let b = createPlan({ plot: 'B', cropKey: 'spring-corn', harvestDate: '2025-09-20' });
    b = addNode(b, { type: 'other', label: 'X', date: '2025-07-01' });
    b = addNode(b, { type: 'other', label: 'Y', date: '2025-07-01' });
    expect(analyzePlotLoad([a, b])).toHaveLength(0);
  });
});

describe('节点名称', () => {
  it('带 label 时显示“类型·标签”', () => {
    const plan = createPlan({ plot: 'N', cropKey: 'rice', harvestDate: '2025-09-20' });
    expect(nodeName(byType(plan, 'topdress', '穗肥'))).toBe('追肥·穗肥');
  });
});
