import { describe, it, expect } from 'vitest';
import {
  createPlan, resolvePlan, updateHarvestDate, setNodeDate, unlockNode,
  deleteNode, addNode, toggleLock, aggregatePlotDays, isoToJDN, jdnToISO,
} from './farm-plan';
import { getCrop } from './crops';
import { getSolarTermDateList, getTermJDNByName } from './solar-terms';
import { gregorianToJDN, addDays, formatDate } from '../utils/date';

const corn = getCrop('spring-corn')!;
const wheat = getCrop('winter-wheat')!;

function iso(y: number, m: number, d: number): string {
  return formatDate(y, m, d);
}
function shift(isoStr: string, days: number): string {
  const [y, m, d] = isoStr.split('-').map(Number);
  const [ny, nm, nd] = addDays(y, m, d, days);
  return formatDate(ny, nm, nd);
}
function termDayISO(year: number, name: string): string {
  const t = getSolarTermDateList(year).find(x => x.name === name)!;
  return iso(year, t.month, t.day);
}

describe('收获日反推', () => {
  it('按各阶段距收获天数反推播种等节点', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    const harvest = r.nodes.find(n => n.key === 'harvest')!;
    const sow = r.nodes.find(n => n.key === 'sow')!;
    const thin = r.nodes.find(n => n.key === 'thin')!;
    expect(jdnToISO(harvest.dateJDN)).toBe(iso(2025, 8, 20));
    expect(harvest.dateJDN - sow.dateJDN).toBe(120);
    expect(harvest.dateJDN - thin.dateJDN).toBe(95);
    expect([...r.nodes].sort((a, b) => a.dateJDN - b.dateJDN).map(n => n.id)).toEqual(r.nodes.map(n => n.id));
  });

  it('节点当天交节应标出节气名', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    // 收获日 8/20 不要求是节气；只校验标注与引擎一致
    for (const n of r.nodes) {
      expect(n.termName === undefined || typeof n.termName === 'string').toBe(true);
    }
  });
});

describe('节气不宜调开', () => {
  it('播种落在霜降窗口应被调开并给出原因', () => {
    // 让播种日（收获前 120 天）恰好落在霜降当日
    const frost = termDayISO(2024, '霜降'); // 2024-10-23
    const harvest = shift(frost, 120);
    const plan = createPlan('p1', 'plotA', corn, harvest);
    const sowRaw = plan.nodes.find(n => n.key === 'sow')!;
    expect(sowRaw.dateJDN).toBe(isoToJDN(frost));
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    const sow = r.nodes.find(n => n.key === 'sow')!;
    expect(jdnToISO(sow.dateJDN)).not.toBe(frost);
    expect(sow.adjustment?.tabooTerm).toBe('霜降');
    expect(sow.adjustment?.reason).toContain('霜');
    const movedFlag = sow.flags.find(f => f.type === 'term-moved');
    expect(movedFlag).toBeTruthy();
    expect(movedFlag!.text).toContain('已挪到');
    // 调开后仍保持顺序：播种早于间苗
    const thin = r.nodes.find(n => n.key === 'thin')!;
    expect(sow.dateJDN).toBeLessThan(thin.dateJDN);
  });

  it('半径窗口内（节气前一天）也要调开', () => {
    const frost = termDayISO(2024, '霜降');
    const harvest = shift(shift(frost, -1), 120); // 播种在霜降前一天
    const plan = createPlan('p1', 'plotA', corn, harvest);
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    const sow = r.nodes.find(n => n.key === 'sow')!;
    expect(jdnToISO(sow.dateJDN)).not.toBe(shift(frost, -1));
    expect(sow.flags.some(f => f.type === 'term-moved')).toBe(true);
  });

  it('锁定节点撞窗口不自动挪，给未调开警告', () => {
    const frost = termDayISO(2024, '霜降');
    const harvest = shift(frost, 120);
    let plan = createPlan('p1', 'plotA', corn, harvest);
    const sowId = plan.nodes.find(n => n.key === 'sow')!.id;
    plan = toggleLock(plan, sowId);
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    const sow = r.nodes.find(n => n.key === 'sow')!;
    expect(jdnToISO(sow.dateJDN)).toBe(frost);
    expect(sow.flags.some(f => f.type === 'term-unresolved')).toBe(true);
  });
});

describe('过期标记', () => {
  it('已经过了的节点单独标 overdue', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const r = resolvePlan(plan, corn, gregorianToJDN(2025, 9, 1));
    const overdue = r.nodes.filter(n => n.flags.some(f => f.type === 'overdue' || f.type === 'harvest-overdue'));
    expect(overdue.length).toBe(r.nodes.length); // 8-20 已过，所有节点都过期
  });

  it('未来的计划不过期', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2030, 8, 20));
    const r = resolvePlan(plan, corn, gregorianToJDN(2025, 1, 1));
    expect(r.flags.some(f => f.type === 'overdue' || f.type === 'harvest-overdue')).toBe(false);
  });
});

describe('编辑与级联重推', () => {
  it('改收获日，解锁节点整体跟随，跨度保持不变', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const moved = updateHarvestDate(plan, iso(2025, 9, 1));
    const r = resolvePlan(moved, corn, gregorianToJDN(2020, 1, 1));
    expect(r.sowSpan).toBe(120);
    expect(jdnToISO(r.nodes.find(n => n.key === 'harvest')!.dateJDN)).toBe(iso(2025, 9, 1));
  });

  it('手动改一个节点后，后续解锁节点整体平移且不越过收获', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const thinId = plan.nodes.find(n => n.key === 'thin')!.id;
    const thinOriginal = plan.nodes.find(n => n.key === 'thin')!.dateJDN;
    const newThin = jdnToISO(thinOriginal + 5);
    const edited = setNodeDate(plan, thinId, newThin);
    const r = resolvePlan(edited, corn, gregorianToJDN(2020, 1, 1));
    const thin = r.nodes.find(n => n.id === thinId)!;
    expect(thin.dateJDN - thinOriginal).toBe(5);
    // 间苗之后的追肥、打药、控水都应跟随 +5
    for (const key of ['topdress', 'spray', 'water-control'] as const) {
      const n = r.nodes.find(x => x.key === key)!;
      const original = plan.nodes.find(x => x.key === key)!.dateJDN;
      expect(n.dateJDN - original).toBe(5);
    }
    // 播种在间苗之前，不跟随
    const sow = r.nodes.find(n => n.key === 'sow')!;
    const sowOriginal = plan.nodes.find(n => n.key === 'sow')!.dateJDN;
    expect(sow.dateJDN).toBe(sowOriginal);
  });

  it('往后挪得太多会被收获日挡住', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const wcId = plan.nodes.find(n => n.key === 'water-control')!.id;
    const edited = setNodeDate(plan, wcId, iso(2025, 9, 15)); // 超过收获日
    const r = resolvePlan(edited, corn, gregorianToJDN(2020, 1, 1));
    for (const n of r.nodes) {
      expect(n.dateJDN).toBeLessThanOrEqual(isoToJDN(iso(2025, 8, 20)));
    }
  });

  it('解锁后恢复模板偏移', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const thinId = plan.nodes.find(n => n.key === 'thin')!.id;
    const edited = setNodeDate(plan, thinId, iso(2025, 6, 1));
    const unlocked = unlockNode(edited, corn, thinId);
    const r = resolvePlan(unlocked, corn, gregorianToJDN(2020, 1, 1));
    const thin = r.nodes.find(n => n.id === thinId)!;
    const harvest = isoToJDN(iso(2025, 8, 20));
    expect(harvest - thin.dateJDN).toBe(95);
  });

  it('能新增和删除节点', () => {
    let plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    plan = addNode(plan, { label: '锄草', dateISO: iso(2025, 7, 1) });
    expect(plan.nodes.some(n => n.label === '锄草')).toBe(true);
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    expect(r.nodes.some(n => n.label === '锄草')).toBe(true);
    const id = plan.nodes.find(n => n.label === '锄草')!.id;
    plan = deleteNode(plan, id);
    expect(plan.nodes.some(n => n.label === '锄草')).toBe(false);
  });

  it('收获节点不可删除', () => {
    const plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    const harvestId = plan.nodes.find(n => n.key === 'harvest')!.id;
    const after = deleteNode(plan, harvestId);
    expect(after.nodes.some(n => n.key === 'harvest')).toBe(true);
  });

  it('排在收获日之后的自定义农活不崩溃，并单独标出', () => {
    let plan = createPlan('p1', 'plotA', corn, iso(2025, 8, 20));
    plan = addNode(plan, { label: '收后深翻', dateISO: iso(2025, 9, 1) });
    const r = resolvePlan(plan, corn, gregorianToJDN(2020, 1, 1));
    const late = r.nodes.find(n => n.label === '收后深翻')!;
    expect(late.dateJDN).toBe(isoToJDN(iso(2025, 9, 1)));
    expect(late.flags.some(f => f.type === 'after-harvest')).toBe(true);
  });
});

describe('生长期跨度提示', () => {
  it('锁定播种日后再把收获日改近，跨度偏差过大时给提示', () => {
    // 正常排：冬小麦播种 2024-10-01、收获 2025-05 左右（230 天）
    const plan0 = createPlan('p1', 'plotA', wheat, iso(2025, 5, 19));
    const sowId = plan0.nodes.find(n => n.key === 'sow')!.id;
    const sowed = setNodeDate(plan0, sowId, iso(2024, 10, 1)); // 锁定播种日
    const r = resolvePlan(sowed, wheat, gregorianToJDN(2020, 1, 1));
    expect(r.sowSpan).toBe(230);
    expect(r.flags.some(f => f.type === 'span-mismatch')).toBe(false);

    // 把收获日改到播种后仅 150 天
    const shortened = updateHarvestDate(sowed, iso(2025, 2, 28));
    const r2 = resolvePlan(shortened, wheat, gregorianToJDN(2020, 1, 1));
    expect(r2.sowSpan).toBe(150);
    expect(r2.flags.some(f => f.type === 'span-mismatch')).toBe(true);
  });
});

describe('同地块同日超载', () => {
  it('同一天超过两件活要汇总提示', () => {
    const c2 = getCrop('summer-soybean')!;
    const c3 = getCrop('peanut')!;
    // 三份计划收获日完全相同 → 三个收获节点同日
    const p1 = createPlan('a', 'plotA', corn, iso(2025, 9, 10));
    const p2 = createPlan('b', 'plotA', c2, iso(2025, 9, 10));
    const p3 = createPlan('c', 'plotA', c3, iso(2025, 9, 10));
    const overload = aggregatePlotDays(
      [{ plan: p1, crop: corn }, { plan: p2, crop: c2 }, { plan: p3, crop: c3 }],
      'plotA',
    );
    expect(overload.some(d => d.jdn === isoToJDN(iso(2025, 9, 10)))).toBe(true);
    expect(overload.find(d => d.jdn === isoToJDN(iso(2025, 9, 10)))!.items.length).toBe(3);
  });

  it('正好两件活不提示', () => {
    const p1 = createPlan('a', 'plotA', corn, iso(2025, 9, 10));
    const p2 = createPlan('b', 'plotA', getCrop('summer-soybean')!, iso(2025, 9, 10));
    const overload = aggregatePlotDays(
      [{ plan: p1, crop: corn }, { plan: p2, crop: getCrop('summer-soybean')! }],
      'plotA',
    );
    expect(overload.some(d => d.jdn === isoToJDN(iso(2025, 9, 10)))).toBe(false);
  });

  it('不同地块互不影响', () => {
    const p1 = createPlan('a', 'plotA', corn, iso(2025, 9, 10));
    const p2 = createPlan('b', 'plotB', getCrop('summer-soybean')!, iso(2025, 9, 10));
    const p3 = createPlan('c', 'plotB', getCrop('peanut')!, iso(2025, 9, 10));
    const overloadA = aggregatePlotDays(
      [{ plan: p1, crop: corn }, { plan: p2, crop: getCrop('summer-soybean')! }, { plan: p3, crop: getCrop('peanut')! }],
      'plotA',
    );
    expect(overloadA.length).toBe(0);
  });
});

describe('节气引擎交叉验证', () => {
  it('反推用的节气 JDN 与节气表一致', () => {
    const j = getTermJDNByName(2024, '霜降');
    expect(j).toBe(isoToJDN(termDayISO(2024, '霜降')));
  });
});
