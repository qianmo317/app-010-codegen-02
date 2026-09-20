// 农事排程引擎
//
// 核心模型：采收日是用户给定的「锚」，播种日 = 采收日 − 生长天数；
// 其余节点按作物模板里相对播种/采收的偏移推出。
// 推出的每个日子都过一遍节气规则（四离四绝避让、播种节气窗口），
// 调过的日子记录调整原因；间距太近、已经过期、采收日不吉等只标注不强改。
// 编辑节点后，按锚链把受影响的后续节点连带重推。

import { gregorianToJDN, jdnToGregorian } from '../utils/date';
import { getActiveTerm, getSolarTermDate } from './solar-terms';
import { SOLAR_TERMS } from './constants';
import { getForbiddenDay, getSowWindow, isInSowWindow, getSprayHeatWarning } from './farm-rules';
import {
  CropTemplate,
  CropNodeTemplate,
  Hardiness,
  NodeType,
  NODE_TYPE_LABEL,
  getCropTemplate,
} from './crops';

export type { CropTemplate, NodeType };

export interface DateAdjustment {
  from: string; // 调整前 YYYY-MM-DD
  to: string; // 调整后
  reasons: string[];
}

export interface FarmNode {
  id: string;
  type: NodeType;
  label?: string;
  base: 'sow' | 'harvest'; // 相对哪个锚推算
  offsetDays: number; // 当前实际偏移（sow 锚：播后为正；harvest 锚：收前为负）
  date: string; // YYYY-MM-DD
  note?: string;
  locked: boolean; // 用户手动改过/新增后锁定，自动重推不移动它
  adjustments: DateAdjustment[]; // 自动调整履历（初始推算与连锁重推产生）
  manual?: boolean; // 用户手动新增
}

export interface FarmPlan {
  id: string;
  plot: string; // 地块名
  cropKey: string;
  cropName: string;
  hardiness: Hardiness;
  growthDays: number;
  harvestDate: string;
  nodes: FarmNode[];
  createdAt: string;
}

export type WarningLevel = 'error' | 'warn' | 'info';

export interface NodeWarning {
  level: WarningLevel;
  code: 'past' | 'too-close' | 'forbidden-harvest' | 'heat-spray' | 'sow-after-harvest' | 'far-shift';
  nodeId?: string;
  message: string;
}

export interface PlotWarning {
  level: WarningLevel;
  date: string;
  plot: string;
  count: number;
  message: string;
}

let idSeq = 0;
export function genId(prefix = 'n'): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}_${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// ---------- 日期工具 ----------

export function toJdn(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return gregorianToJDN(y, m, d);
}

export function fromJdn(jdn: number): string {
  const [y, m, d] = jdnToGregorian(jdn);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// ---------- 节气规则 ----------

// 四离四绝避让：从某日起向前后找最近的「可用日」。等距时取靠前（农活宜早）。
// 返回 [新JDN, 移动天数, 原因]；无需移动时 delta=0。
function moveOffForbidden(jdn: number): { jdn: number; delta: number; reason?: string } {
  const check = (j: number) => {
    const [y, m, d] = jdnToGregorian(j);
    return getForbiddenDay(y, m, d);
  };
  const here = check(jdn);
  if (!here.forbidden) return { jdn, delta: 0 };

  for (let step = 1; step <= 10; step++) {
    const before = jdn - step;
    const after = jdn + step;
    if (!check(before).forbidden) {
      const info = check(jdn);
      return { jdn: before, delta: -step, reason: `${info.reason}，提前 ${step} 天避开` };
    }
    if (!check(after).forbidden) {
      const info = check(jdn);
      return { jdn: after, delta: step, reason: `${info.reason}，顺延 ${step} 天避开` };
    }
  }
  return { jdn, delta: 0, reason: here.reason };
}

// 播种日节气窗口调整。返回新JDN与调整原因（未调整则 delta=0）。
function adjustSowWindow(sowJdn: number, hardiness: Hardiness): { jdn: number; delta: number; reasons: string[] } {
  const [y, m, d] = jdnToGregorian(sowJdn);
  const term = getActiveTerm(y, m, d);
  if (isInSowWindow(term, hardiness)) return { jdn: sowJdn, delta: 0, reasons: [] };

  const win = getSowWindow(hardiness);
  // 找距播种日最近的窗口起点交节日（跨年时在前一年/当年之间选）
  const candidates: number[] = [];
  for (const yy of [y - 1, y, y + 1]) {
    candidates.push(termJdn(win.startTerm, yy));
  }
  let target = candidates[0];
  for (const c of candidates.slice(1)) {
    if (Math.abs(c - sowJdn) < Math.abs(target - sowJdn)) target = c;
  }
  const delta = target - sowJdn;
  return {
    jdn: target,
    delta,
    reasons: [`原推算播种日落在「${term}」，不在${hardiness === 'tender' ? '喜温作物' : '耐寒作物'}适播窗口（${win.description}），移到「${win.startTerm}」交节日`],
  };
}

// 某年某节气交节日 JDN
function termJdn(name: string, year: number): number {
  const idx = SOLAR_TERMS.indexOf(name);
  const [ty, tm, td] = getSolarTermDate(idx, year);
  return gregorianToJDN(ty, tm, td);
}

// ---------- 初始排程 ----------

export interface CreatePlanInput {
  plot: string;
  cropKey: string;
  cropName?: string;
  hardiness?: Hardiness;
  growthDays?: number;
  harvestDate: string; // YYYY-MM-DD
  templates?: CropNodeTemplate[]; // 自定义作物用
}

// 输入地块、作物、采收日，倒推出整份安排（含节气调整与原因）
export function createPlan(input: CreatePlanInput): FarmPlan {
  const tpl: CropTemplate = (() => {
    const base = getCropTemplate(input.cropKey);
    return {
      ...base,
      name: input.cropName ?? base.name,
      hardiness: input.hardiness ?? base.hardiness,
      defaultGrowthDays: input.growthDays ?? base.defaultGrowthDays,
      nodes: input.templates ?? base.nodes,
    };
  })();

  const growthDays = input.growthDays ?? tpl.defaultGrowthDays;
  const harvestJdn = toJdn(input.harvestDate);

  // 1) 播种日 = 采收 − 生长天数
  let sowJdn = harvestJdn - growthDays;
  const rawSowJdn = sowJdn;
  const sowReasons: string[] = [];

  // 2) 播种窗口（霜期）调整
  const win = adjustSowWindow(sowJdn, tpl.hardiness);
  sowJdn = win.jdn;
  sowReasons.push(...win.reasons);

  // 3) 四离四绝避让（窗口移动可能落在节气前一天）
  const fb = moveOffForbidden(sowJdn);
  sowJdn = fb.jdn;
  if (fb.reason) sowReasons.push(fb.reason);

  const actualGrowth = harvestJdn - sowJdn;

  // 4) 生成节点
  const nodes: FarmNode[] = tpl.nodes.map(t => buildNode(t, sowJdn, harvestJdn));
  // 播种节点仅在日期被节气规则移动时记录调整履历
  const sowNode = nodes.find(n => n.type === 'sow');
  if (sowNode && rawSowJdn !== sowJdn && sowReasons.length) {
    sowNode.adjustments = [{ from: fromJdn(rawSowJdn), to: fromJdn(sowJdn), reasons: sowReasons }];
  }

  return {
    id: genId('plan'),
    plot: input.plot,
    cropKey: input.cropKey,
    cropName: tpl.name,
    hardiness: tpl.hardiness,
    growthDays: actualGrowth,
    harvestDate: input.harvestDate,
    nodes: sortNodes(nodes),
    createdAt: new Date().toISOString(),
  };
}

// 按模板偏移造节点；非锚节点再做四离四绝避让
function buildNode(t: CropNodeTemplate, sowJdn: number, harvestJdn: number): FarmNode {
  const isSow = t.type === 'sow';
  const isHarvest = t.type === 'harvest';

  let jdn: number;
  if (isSow) jdn = sowJdn;
  else if (isHarvest) jdn = harvestJdn;
  else jdn = (t.base === 'sow' ? sowJdn : harvestJdn) + t.offsetDays;

  const rawJdn = jdn;
  const reasons: string[] = [];
  if (!isSow && !isHarvest) {
    const moved = moveOffForbidden(jdn);
    jdn = moved.jdn;
    if (moved.reason) reasons.push(moved.reason);
  }

  // 实际偏移以日期差记录（避让后偏移会变化，后续连锁按它平移）
  const anchor = t.base === 'sow' ? sowJdn : harvestJdn;
  const offsetDays = jdn - anchor;

  const node: FarmNode = {
    id: genId(),
    type: t.type,
    label: t.label,
    base: t.base,
    offsetDays,
    date: fromJdn(jdn),
    note: t.note,
    locked: false,
    adjustments: [],
  };
  if (jdn !== rawJdn && reasons.length) {
    node.adjustments.push({ from: fromJdn(rawJdn), to: node.date, reasons });
  }
  return node;
}

function sortNodes(nodes: FarmNode[]): FarmNode[] {
  return [...nodes].sort((a, b) => toJdn(a.date) - toJdn(b.date));
}

// ---------- 分析与告警 ----------

// 相邻节点最小间隔（天），低于即判「挨太近」
const MIN_GAP_RULES: Array<{ a: NodeType; b: NodeType; gap: number; desc: string }> = [
  { a: 'sow', b: 'thin', gap: 7, desc: '间苗应在出苗后 7 天以上' },
  { a: 'topdress', b: 'topdress', gap: 10, desc: '两次追肥至少间隔 10 天' },
  { a: 'spray', b: 'spray', gap: 7, desc: '两次打药至少间隔 7 天（防药害）' },
  { a: 'waterControl', b: 'harvest', gap: 5, desc: '控水到采收至少留 5 天' },
];
const DEFAULT_MIN_GAP = 3;

export function analyzePlan(plan: FarmPlan, today: string = todayStr()): NodeWarning[] {
  const warnings: NodeWarning[] = [];
  const todayJdn = toJdn(today);
  const nodes = sortNodes(plan.nodes);

  // 已过期
  for (const n of nodes) {
    if (toJdn(n.date) < todayJdn) {
      warnings.push({ level: 'info', code: 'past', nodeId: n.id, message: `该节点日期已过（今天 ${today}），如需执行请重排` });
    }
  }

  // 播种不早于采收（窗口调整后的极端情况）
  const sow = nodes.find(n => n.type === 'sow');
  const harvest = nodes.find(n => n.type === 'harvest');
  if (sow && harvest && toJdn(sow.date) >= toJdn(harvest.date)) {
    warnings.push({
      level: 'error',
      code: 'sow-after-harvest',
      nodeId: sow.id,
      message: '播种日被节气窗口顶到了采收日之后或与采收同日，请提前采收日或缩短生长天数',
    });
  }

  // 播种被移动超过 10 天：提示改采收期
  if (sow && sow.adjustments.length > 0) {
    const delta = toJdn(sow.date) - toJdn(sow.adjustments[0].from);
    if (Math.abs(delta) > 10) {
      warnings.push({
        level: 'warn',
        code: 'far-shift',
        nodeId: sow.id,
        message: `播种日被节气规则移动了 ${Math.abs(delta)} 天，实际生长期变为 ${plan.growthDays} 天；若要保持原生长天数，建议把采收日改到 ${fromJdn(toJdn(sow.date) + plan.growthDays)} 前后`,
      });
    }
  }

  // 采收日落四离四绝（只提示，不移动用户的目标日）
  if (harvest) {
    const [hy, hm, hd] = jdnToGregorian(toJdn(harvest.date));
    const fb = getForbiddenDay(hy, hm, hd);
    if (fb.forbidden) {
      warnings.push({ level: 'warn', code: 'forbidden-harvest', nodeId: harvest.id, message: `${fb.reason}；采收日为指定目标未自动调整，可手动提前或顺延一天` });
    }
  }

  // 打药遇暑热
  for (const n of nodes.filter(x => x.type === 'spray')) {
    const [y, m, d] = jdnToGregorian(toJdn(n.date));
    const heat = getSprayHeatWarning(getActiveTerm(y, m, d));
    if (heat) warnings.push({ level: 'info', code: 'heat-spray', nodeId: n.id, message: heat });
  }

  // 节点挨太近
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    const gap = toJdn(cur.date) - toJdn(prev.date);
    const rule = MIN_GAP_RULES.find(r => {
      if (r.a === r.b) return prev.type === r.a && cur.type === r.b;
      return (r.a === prev.type && r.b === cur.type) || (r.a === cur.type && r.b === prev.type);
    });
    const minGap = rule?.gap ?? DEFAULT_MIN_GAP;
    if (gap < minGap) {
      warnings.push({
        level: 'warn',
        code: 'too-close',
        nodeId: cur.id,
        message: `「${nodeName(prev)}」与「${nodeName(cur)}」只差 ${gap} 天${rule ? `（${rule.desc}）` : '（两道活建议至少间隔 3 天）'}`,
      });
    }
  }

  return warnings;
}

export function nodeName(n: FarmNode): string {
  return n.label ? `${NODE_TYPE_LABEL[n.type]}·${n.label}` : NODE_TYPE_LABEL[n.type];
}

// ---------- 地块级：同一天活太多 ----------

export function analyzePlotLoad(plans: FarmPlan[]): PlotWarning[] {
  const byPlotDate = new Map<string, { plot: string; date: string; count: number }>();
  for (const p of plans) {
    for (const n of p.nodes) {
      const key = `${p.plot}|${n.date}`;
      const cur = byPlotDate.get(key) ?? { plot: p.plot, date: n.date, count: 0 };
      cur.count += 1;
      byPlotDate.set(key, cur);
    }
  }
  const out: PlotWarning[] = [];
  for (const v of byPlotDate.values()) {
    if (v.count > 2) {
      out.push({
        level: 'warn',
        plot: v.plot,
        date: v.date,
        count: v.count,
        message: `「${v.plot}」在 ${v.date} 排了 ${v.count} 件活，超过两件，人手可能安排不开，建议错开`,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- 增 / 删 / 改 与连锁重推 ----------

// 对单个未锁定节点重跑四离四绝避让（只动日期；偏移由调用方按锚重算）
function reapplyForbidden(node: FarmNode) {
  if (node.locked || node.type === 'sow' || node.type === 'harvest') return;
  const jdn = toJdn(node.date);
  const moved = moveOffForbidden(jdn);
  if (moved.delta !== 0) {
    const before = node.date;
    node.date = fromJdn(moved.jdn);
    node.adjustments.push({ from: before, to: node.date, reasons: [moved.reason ?? '避开四离四绝'] });
  }
}

// 按节点当前锚点重算偏移（避让/连锁平移之后调用，保证 date 与 offsetDays 一致）
function recalcOffset(node: FarmNode, sowJdn: number, harvestJdn: number) {
  if (node.type === 'harvest') node.offsetDays = 0;
  else node.offsetDays = toJdn(node.date) - (node.base === 'sow' ? sowJdn : harvestJdn);
}

// 移动播种日 delta 天后：base='sow' 的未锁定节点保持相对播种的工序间隔，再重跑避让
export function shiftSowing(plan: FarmPlan, newSowDate: string): FarmPlan {
  const next = clonePlan(plan);
  const oldSowJdn = toJdn(findNode(next, 'sow').date);
  const newSowJdn = toJdn(newSowDate);
  const delta = newSowJdn - oldSowJdn;
  if (delta === 0) return next;

  const sowNode = findNode(next, 'sow');
  sowNode.adjustments.push({ from: sowNode.date, to: newSowDate, reasons: [`播种日改为 ${newSowDate}，播种后的节点按原工序间隔连带重推`] });
  const harvestJdn = toJdn(next.harvestDate);
  sowNode.date = newSowDate;
  recalcOffset(sowNode, newSowJdn, harvestJdn);
  for (const n of next.nodes) {
    if (n.base === 'sow' && n.type !== 'sow' && !n.locked) {
      n.date = fromJdn(newSowJdn + n.offsetDays);
      reapplyForbidden(n);
      recalcOffset(n, newSowJdn, harvestJdn);
    }
    // base='harvest' 的节点锚定采收日，播种移动不影响它们
  }
  next.growthDays = harvestJdn - newSowJdn;
  next.nodes = sortNodes(next.nodes);
  return next;
}

// 改采收日：非锁定节点按锚链全部重推；锁定的手动节点日期不动
export function updateHarvestDate(plan: FarmPlan, newHarvestDate: string): FarmPlan {
  const next = clonePlan(plan);
  const oldHarvest = plan.harvestDate;
  next.harvestDate = newHarvestDate;
  const newHarvestJdn = toJdn(newHarvestDate);

  // 播种：维持生长天数倒推，再走节气规则
  const sowNode = findNode(next, 'sow');
  if (!sowNode.locked) {
    const raw = newHarvestJdn - next.growthDays;
    const win = adjustSowWindow(raw, next.hardiness);
    let sowJdn = win.jdn;
    const fb = moveOffForbidden(sowJdn);
    sowJdn = fb.jdn;
    const reasons = [...win.reasons, ...(fb.reason ? [fb.reason] : [])];
    if (sowNode.date !== fromJdn(sowJdn)) {
      sowNode.adjustments.push({
        from: sowNode.date,
        to: fromJdn(sowJdn),
        reasons: reasons.length ? reasons : [`采收日由 ${oldHarvest} 改为 ${newHarvestDate}，按生长天数倒推播种日`],
      });
    }
    sowNode.date = fromJdn(sowJdn);
    recalcOffset(sowNode, sowJdn, newHarvestJdn);
  }

  const sowJdn = toJdn(findNode(next, 'sow').date);
  for (const n of next.nodes) {
    if (n.locked || n.type === 'sow') continue;
    if (n.type === 'harvest') {
      n.date = newHarvestDate;
      n.offsetDays = 0;
      continue;
    }
    // 按当前偏移回到锚链，再避让四离四绝
    n.date = fromJdn((n.base === 'sow' ? sowJdn : newHarvestJdn) + n.offsetDays);
    reapplyForbidden(n);
    recalcOffset(n, sowJdn, newHarvestJdn);
  }
  next.growthDays = newHarvestJdn - sowJdn;
  next.nodes = sortNodes(next.nodes);
  return next;
}

// 改生长天数：播种日按采收日重新倒推并走节气规则，其后节点连锁
export function updateGrowthDays(plan: FarmPlan, growthDays: number): FarmPlan {
  const newSow = fromJdn(toJdn(plan.harvestDate) - growthDays);
  // 先临时去掉播种锁定的影响：生长天数是硬参数，播种重算
  const next = clonePlan(plan);
  const sowNode = findNode(next, 'sow');
  sowNode.locked = false;
  return shiftSowingRaw(next, toJdn(newSow), `生长天数改为 ${growthDays} 天，播种日按采收日重新倒推`);
}

function shiftSowingRaw(plan: FarmPlan, targetSowJdn: number, reason: string): FarmPlan {
  const win = adjustSowWindow(targetSowJdn, plan.hardiness);
  let jdn = win.jdn;
  const fb = moveOffForbidden(jdn);
  jdn = fb.jdn;
  const reasons = [reason, ...win.reasons, ...(fb.reason ? [fb.reason] : [])];

  const sowNode = findNode(plan, 'sow');
  const harvestJdn = toJdn(plan.harvestDate);
  const newSowDate = fromJdn(jdn);
  if (sowNode.date !== newSowDate) {
    sowNode.adjustments.push({ from: sowNode.date, to: newSowDate, reasons });
    sowNode.date = newSowDate;
  }
  recalcOffset(sowNode, jdn, harvestJdn);

  for (const n of plan.nodes) {
    if (n.base === 'sow' && n.type !== 'sow' && !n.locked) {
      n.date = fromJdn(jdn + n.offsetDays);
      reapplyForbidden(n);
      recalcOffset(n, jdn, harvestJdn);
    }
  }
  plan.growthDays = harvestJdn - jdn;
  plan.nodes = sortNodes(plan.nodes);
  return plan;
}

// 修改某个普通节点的日期：锁定该节点，同锚且日期在其后的未锁定节点连带平移
export function updateNodeDate(plan: FarmPlan, nodeId: string, newDate: string): FarmPlan {
  const next = clonePlan(plan);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node) return next;

  if (node.type === 'sow') return shiftSowing(next, newDate);
  if (node.type === 'harvest') return updateHarvestDate(next, newDate);

  const delta = toJdn(newDate) - toJdn(node.date);
  const from = node.date;
  node.date = newDate;
  node.locked = true;
  node.offsetDays += delta;
  if (delta !== 0) {
    node.adjustments.push({ from, to: newDate, reasons: ['手动调整（已锁定，自动重推不再移动此节点）'] });
  }

  // 同锚、日期晚于它的未锁定节点保持工序间隔平移
  const sowJdn = toJdn(findNode(next, 'sow').date);
  const harvestJdn = toJdn(next.harvestDate);
  for (const other of next.nodes) {
    if (other.id === node.id || other.locked || other.type === 'sow' || other.type === 'harvest') continue;
    if (other.base !== node.base) continue;
    if (toJdn(other.date) >= toJdn(from)) {
      other.offsetDays += delta;
      other.date = fromJdn((other.base === 'sow' ? sowJdn : harvestJdn) + other.offsetDays);
      reapplyForbidden(other);
      recalcOffset(other, sowJdn, harvestJdn);
    }
  }
  next.nodes = sortNodes(next.nodes);
  return next;
}

// 解锁节点：恢复为相对锚点的模板偏移并重排
export function unlockNode(plan: FarmPlan, nodeId: string, templateOffset?: { base: 'sow' | 'harvest'; offsetDays: number }): FarmPlan {
  const next = clonePlan(plan);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || node.type === 'sow' || node.type === 'harvest') return next;
  node.locked = false;
  const tpl = getCropTemplate(next.cropKey);
  const tplNode = tpl.nodes.find(t => t.type === node.type && t.label === node.label) ?? templateOffset;
  if (tplNode) {
    node.base = tplNode.base;
    node.offsetDays = tplNode.offsetDays;
  }
  const sowJdn = toJdn(findNode(next, 'sow').date);
  const harvestJdn = toJdn(next.harvestDate);
  const anchor = node.base === 'sow' ? sowJdn : harvestJdn;
  node.date = fromJdn(anchor + node.offsetDays);
  reapplyForbidden(node);
  recalcOffset(node, sowJdn, harvestJdn);
  next.nodes = sortNodes(next.nodes);
  return next;
}

export interface AddNodeInput {
  type: NodeType;
  label?: string;
  date?: string; // 直接指定日期（锁定，不跟随锚点）
  base?: 'sow' | 'harvest'; // 或按锚点偏移
  offsetDays?: number;
  note?: string;
}

// 新增一道活
export function addNode(plan: FarmPlan, input: AddNodeInput): FarmPlan {
  const next = clonePlan(plan);
  const sowJdn = toJdn(findNode(next, 'sow').date);
  const harvestJdn = toJdn(next.harvestDate);

  let jdn: number;
  let base: 'sow' | 'harvest';
  let offset: number;
  let locked: boolean;
  if (input.date) {
    jdn = toJdn(input.date);
    // 自动归到较近的锚上（仅用于展示偏移；锁定后不参与平移）
    base = Math.abs(jdn - sowJdn) <= Math.abs(jdn - harvestJdn) ? 'sow' : 'harvest';
    offset = jdn - (base === 'sow' ? sowJdn : harvestJdn);
    locked = true;
  } else {
    base = input.base ?? 'sow';
    offset = input.offsetDays ?? 0;
    jdn = (base === 'sow' ? sowJdn : harvestJdn) + offset;
    locked = false;
    const moved = moveOffForbidden(jdn);
    if (moved.delta !== 0) {
      jdn = moved.jdn;
      offset = jdn - (base === 'sow' ? sowJdn : harvestJdn);
    }
  }

  next.nodes.push({
    id: genId(),
    type: input.type,
    label: input.label,
    base,
    offsetDays: offset,
    date: fromJdn(jdn),
    note: input.note,
    locked,
    manual: true,
    adjustments: input.date ? [] : [],
  });
  next.nodes = sortNodes(next.nodes);
  return next;
}

// 删除一道活（播种/采收为关键节点不可删，由调用方限制 UI；引擎层也拦一下）
export function removeNode(plan: FarmPlan, nodeId: string): FarmPlan {
  const next = clonePlan(plan);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || node.type === 'sow' || node.type === 'harvest') return next;
  next.nodes = next.nodes.filter(n => n.id !== nodeId);
  return next;
}

function findNode(plan: FarmPlan, type: NodeType): FarmNode {
  const n = plan.nodes.find(x => x.type === type);
  if (!n) throw new Error(`缺少 ${NODE_TYPE_LABEL[type]} 节点`);
  return n;
}

function clonePlan(plan: FarmPlan): FarmPlan {
  return {
    ...plan,
    nodes: plan.nodes.map(n => ({ ...n, adjustments: n.adjustments.map(a => ({ ...a, reasons: [...a.reasons] })) })),
  };
}
