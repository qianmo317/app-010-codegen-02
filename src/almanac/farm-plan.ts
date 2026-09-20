// 农事排活核心引擎
//
// 输入「计划收获日」和作物模板，按各阶段距收获的天数往前推出播种、间苗、
// 追肥、打药、控水的日期；逐日跟当年节气对一遍，落在节气不宜窗口里的，
// 在不打乱先后次序、不小于最小间隔的前提下就近调开并记录原因；
// 过期、挨太近、调不开、收获日已过等情况各自打标记。
// 节点可以增删改、锁定/解锁；改动后受影响的后续节点重新推一遍。

import { gregorianToJDN, jdnToGregorian } from '../utils/date';
import { getTermAtDate, isInTermWindow } from './solar-terms';
import { CropDef, PhaseKey, TERM_TABOOS, DEFAULT_MIN_GAP } from './crops';

export type FlagLevel = 'warn' | 'info';

export type FlagType =
  | 'overdue'          // 节点日期已过
  | 'harvest-overdue'  // 收获日已过
  | 'after-harvest'    // 非收获节点排在收获日之后
  | 'too-close'        // 与上一节点间隔小于 minGap
  | 'term-moved'       // 撞节气不宜窗口，已自动调开
  | 'term-unresolved'  // 撞窗口但调不开（锁定 / 无解）
  | 'span-mismatch'    // 实际生长期与经验值偏差过大
  | 'order-conflict';  // 锁定节点与上一节点次序/间隔冲突

export interface PlanFlag {
  nodeId?: string;
  type: FlagType;
  level: FlagLevel;
  text: string;
}

export interface PlanNode {
  id: string;
  key: PhaseKey;
  label: string;
  dateJDN: number;
  locked: boolean;            // 锁定的节点不随收获日漂移、不被自动挪动
  minGap: number;             // 与下一节点的最小间隔（天）
  custom?: boolean;
}

export interface NodeAdjustment {
  fromJDN: number;
  tabooTerm: string;
  reason: string;
}

export interface ResolvedNode {
  id: string;
  key: PhaseKey;
  label: string;
  dateJDN: number;
  termName?: string;   // 当天交节
  locked: boolean;
  custom?: boolean;
  adjustment?: NodeAdjustment;
  flags: PlanFlag[];
}

export interface ResolvedPlan {
  planId: string;
  plotId: string;
  crop: CropDef;
  harvestJDN: number;
  harvestTerm?: string;
  nodes: ResolvedNode[]; // 时间升序
  flags: PlanFlag[];
  sowSpan: number;       // 播种→收获实际跨度
}

export interface PlotPlan {
  id: string;
  plotId: string;
  cropId: string;
  harvestISO: string;    // 计划收获日 YYYY-MM-DD
  nodes: PlanNode[];
}

let idSeq = 0;
function uid(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

export function isoToJDN(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return gregorianToJDN(y, m, d);
}

export function jdnToISO(jdn: number): string {
  const [y, m, d] = jdnToGregorian(jdn);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function jdnYear(jdn: number): number {
  return jdnToGregorian(jdn)[0];
}

// 由作物模板生成初始计划（收获节点锁定在计划收获日，其余节点由收获日反推）
export function createPlan(planId: string, plotId: string, crop: CropDef, harvestISO: string): PlotPlan {
  const harvestJDN = isoToJDN(harvestISO);
  const nodes: PlanNode[] = crop.stages.map(s => ({
    id: uid('n'),
    key: s.key,
    label: s.label,
    dateJDN: harvestJDN - s.beforeHarvestDays,
    locked: false,
    minGap: s.minGap,
  }));
  nodes.push({ id: uid('n'), key: 'harvest', label: '收获', dateJDN: harvestJDN, locked: true, minGap: 0 });
  return { id: planId, plotId, cropId: crop.id, harvestISO, nodes };
}

export interface HitTaboo { term: string; reason: string }

// 某日是否命中某阶段的节气不宜窗口（跨年一起查）
function findTaboo(key: PhaseKey, jdn: number): HitTaboo | undefined {
  if (key === 'custom' || key === 'harvest') return undefined;
  const rule = TERM_TABOOS[key];
  if (!rule) return undefined;
  const year = jdnYear(jdn);
  for (const term of rule.terms) {
    if (isInTermWindow(jdn, term, year, rule.radius)) return { term, reason: rule.reason };
  }
  return undefined;
}

// 在 (-∞, upper] 范围内找离 target 最近、且满足 lower 下界、不落在任何不宜窗口的日期。
// 等距时取更早的那天。找不到返回 undefined。
function nearestClearDate(key: PhaseKey, target: number, lower: number, upper: number): number | undefined {
  if (lower > upper) return undefined;
  for (let dist = 0; target - dist >= lower || target + dist <= upper; dist++) {
    const early = target - dist;
    if (early >= lower && early <= upper && !findTaboo(key, early)) return early;
    const late = target + dist;
    if (dist > 0 && late >= lower && late <= upper && !findTaboo(key, late)) return late;
  }
  return undefined;
}

export function todayJDN(): number {
  const d = new Date();
  return gregorianToJDN(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// 核心：把一份计划推出「最终生效」的节点日期、节气对照和标记。
// 两遍走：第一遍从收获日倒序排定日期（保次序、保间隔、躲节气）；
//         第二遍正序补充过期、太近等提示。
export function resolvePlan(plan: PlotPlan, crop: CropDef, today: number = todayJDN()): ResolvedPlan {
  const harvestJDN = isoToJDN(plan.harvestISO);
  const ordered = [...plan.nodes].sort((a, b) => a.dateJDN - b.dateJDN);

  // 第一遍：倒序确定每个节点的最终日期。
  // 解锁节点保持「距收获日」的名义位置，只有撞上节气不宜窗口时才在
  // 「不越过下一节点」的前提下就近调开；间隔太近一律只警告、不硬推。
  // 注意：自定义农活可能排在收获日之后（收获不保证是最后一个节点）。
  const finalDates = new Map<string, number>();
  const adjustments = new Map<string, NodeAdjustment>();

  for (let i = ordered.length - 1; i >= 0; i--) {
    const node = ordered[i];
    let date = node.dateJDN;

    if (node.key === 'harvest') {
      date = harvestJDN;
    } else if (!node.locked) {
      const nextNode = ordered[i + 1];
      // 有后继节点就不能晚到它那天；排在收获之后、又没有后继的节点无上界
      const upper = nextNode ? finalDates.get(nextNode.id)! - 1 : Number.MAX_SAFE_INTEGER;
      const hit = findTaboo(node.key, date);
      if (hit) {
        const moved = nearestClearDate(node.key, date, Number.MIN_SAFE_INTEGER, upper);
        if (moved !== undefined && moved !== date) {
          adjustments.set(node.id, { fromJDN: node.dateJDN, tabooTerm: hit.term, reason: hit.reason });
          date = moved;
        }
      }
    }
    finalDates.set(node.id, date);
  }

  // 第二遍：正序生成节点与标记
  const nodes: ResolvedNode[] = [];
  const flags: PlanFlag[] = [];
  let prevDate = Number.NEGATIVE_INFINITY;
  let prevGap = 0;
  let prevNode: ResolvedNode | undefined;

  for (const node of ordered) {
    const date = finalDates.get(node.id)!;
    const nf: PlanFlag[] = [];

    // 顺序/间隔冲突
    if (prevNode && date - prevDate < prevGap) {
      const text = `「${prevNode.label}」与「${node.label}」只隔 ${date - prevDate} 天，建议至少隔 ${prevGap} 天`;
      if (node.locked || node.key === 'custom' || prevNode.locked) {
        nf.push({ nodeId: node.id, type: 'order-conflict', level: 'warn', text: `${text}（涉及已锁定/自定义节点，未自动挪动）` });
      } else {
        nf.push({ nodeId: node.id, type: 'too-close', level: 'warn', text });
      }
    }

    // 节气不宜（倒序没挪走的：锁定节点 / 无解）
    const taboo = findTaboo(node.key, date);
    if (taboo) {
      nf.push({
        nodeId: node.id, type: 'term-unresolved', level: 'warn',
        text: `「${node.label}」正落在「${taboo.term}」前后的不宜窗口内。${taboo.reason}`,
      });
    }

    // 排在收获日之后的非收获节点
    if (node.key !== 'harvest' && date > harvestJDN) {
      nf.push({
        nodeId: node.id, type: 'after-harvest', level: 'warn',
        text: `「${node.label}」排在 ${jdnToISO(date)}，晚于计划收获日 ${jdnToISO(harvestJDN)}，确认是否是收后农活`,
      });
    }

    if (node.key === 'harvest') {
      if (today > date) {
        nf.push({ nodeId: node.id, type: 'harvest-overdue', level: 'warn', text: `计划收获日 ${jdnToISO(date)} 已经过了，请改一个将来的收获日` });
      }
    } else if (today > date) {
      nf.push({ nodeId: node.id, type: 'overdue', level: 'warn', text: `「${node.label}」排在 ${jdnToISO(date)}，这天已经过了` });
    }

    const adjustment = adjustments.get(node.id);
    if (adjustment) {
      nf.push({
        nodeId: node.id, type: 'term-moved', level: 'info',
        text: `「${node.label}」原排 ${jdnToISO(adjustment.fromJDN)}，撞上「${adjustment.tabooTerm}」前后不宜，已挪到 ${jdnToISO(date)}。${adjustment.reason}`,
      });
    }

    const resolved: ResolvedNode = {
      id: node.id, key: node.key, label: node.label, dateJDN: date,
      termName: getTermAtDate(...jdnToGregorian(date)),
      locked: node.locked, custom: node.custom, adjustment, flags: nf,
    };
    nodes.push(resolved);
    flags.push(...nf);
    prevDate = date;
    prevGap = node.minGap;
    prevNode = resolved;
  }

  const harvestTerm = getTermAtDate(...jdnToGregorian(harvestJDN));
  let sowSpan = 0;
  const sowResolved = nodes.find(n => n.key === 'sow');
  if (sowResolved) {
    // 以最终播种位置计算计划跨度（锁定的播种日 + 改动后的收获日也能反映出来）
    sowSpan = harvestJDN - sowResolved.dateJDN;
    const diff = sowSpan - crop.growthDays;
    if (Math.abs(diff) > Math.max(3, Math.round(crop.growthDays * 0.1))) {
      flags.unshift({
        type: 'span-mismatch', level: 'info',
        text: `播种→收获计划跨度 ${sowSpan} 天，与「${crop.name}」经验生长期 ${crop.growthDays} 天相差 ${Math.abs(diff)} 天，可能偏${diff > 0 ? '长，注意熟期偏晚' : '短，注意积温不够'}`,
      });
    }
  }

  return { planId: plan.id, plotId: plan.plotId, crop, harvestJDN, harvestTerm, nodes, flags, sowSpan };
}

// 改收获日：收获节点平移；解锁节点保持「距收获天数」跟随；锁定节点不动
export function updateHarvestDate(plan: PlotPlan, newHarvestISO: string): PlotPlan {
  const delta = isoToJDN(newHarvestISO) - isoToJDN(plan.harvestISO);
  const nodes = plan.nodes.map(n => {
    if (n.key === 'harvest') return { ...n, dateJDN: isoToJDN(newHarvestISO) };
    if (n.locked) return n;
    return { ...n, dateJDN: n.dateJDN + delta };
  });
  return { ...plan, harvestISO: newHarvestISO, nodes };
}

// 移动某个节点：手动改期即锁定；其后所有解锁节点整体平移并收敛到收获日之前
export function setNodeDate(plan: PlotPlan, nodeId: string, newISO: string): PlotPlan {
  const newDate = isoToJDN(newISO);
  const harvestJDN = isoToJDN(plan.harvestISO);
  const ordered = [...plan.nodes].sort((a, b) => a.dateJDN - b.dateJDN);
  const idx = ordered.findIndex(n => n.id === nodeId);
  if (idx < 0) return plan;

  const byId = new Map(plan.nodes.map(n => [n.id, { ...n }]));
  const node = byId.get(nodeId)!;
  const delta = newDate - node.dateJDN;
  node.dateJDN = Math.min(newDate, harvestJDN - 1);
  node.locked = true; // 手动改期（即使日子没变）即锁定，不再随收获日漂移

  if (delta !== 0) {
    // 其后所有解锁节点整体平移（收获固定不动），不越过收获日
    for (let i = idx + 1; i < ordered.length; i++) {
      const cur = byId.get(ordered[i].id)!;
      if (cur.locked || cur.key === 'harvest') continue;
      cur.dateJDN = Math.min(cur.dateJDN + delta, harvestJDN - 1);
    }
  }
  return { ...plan, nodes: [...byId.values()] };
}

// 解锁：恢复成按模板偏移跟随收获日（自定义节点解锁后只解除锁定，日期保留）
export function unlockNode(plan: PlotPlan, crop: CropDef, nodeId: string): PlotPlan {
  const harvestJDN = isoToJDN(plan.harvestISO);
  return {
    ...plan,
    nodes: plan.nodes.map(n => {
      if (n.id !== nodeId) return n;
      const tpl = crop.stages.find(s => s.key === n.key && s.label === n.label);
      return { ...n, locked: false, dateJDN: tpl ? harvestJDN - tpl.beforeHarvestDays : n.dateJDN };
    }),
  };
}

export function toggleLock(plan: PlotPlan, nodeId: string): PlotPlan {
  return { ...plan, nodes: plan.nodes.map(n => n.id === nodeId ? { ...n, locked: !n.locked } : n) };
}

export function deleteNode(plan: PlotPlan, nodeId: string): PlotPlan {
  const target = plan.nodes.find(n => n.id === nodeId);
  if (!target || target.key === 'harvest') return plan; // 收获节点不可删
  return { ...plan, nodes: plan.nodes.filter(n => n.id !== nodeId) };
}

export interface AddNodeInput {
  label: string;
  dateISO: string;
  key?: PhaseKey;
  minGap?: number;
}

// 新增一件农活（默认锁定在用户指定的日子）
export function addNode(plan: PlotPlan, input: AddNodeInput): PlotPlan {
  const key = input.key ?? 'custom';
  const node: PlanNode = {
    id: uid('n'),
    key,
    label: input.label,
    dateJDN: isoToJDN(input.dateISO),
    locked: true,
    minGap: input.minGap ?? DEFAULT_MIN_GAP,
    custom: key === 'custom',
  };
  return { ...plan, nodes: [...plan.nodes, node] };
}

export interface OverloadDay {
  jdn: number;
  items: Array<{ planId: string; cropName: string; label: string; key: PhaseKey }>;
}

// 同一块地同一天排的活超过两件（>2）时汇总提示
export function aggregatePlotDays(
  plans: Array<{ plan: PlotPlan; crop: CropDef }>,
  plotId: string,
): OverloadDay[] {
  const byDay = new Map<number, OverloadDay>();
  for (const { plan, crop } of plans) {
    if (plan.plotId !== plotId) continue;
    for (const n of resolvePlan(plan, crop).nodes) {
      let entry = byDay.get(n.dateJDN);
      if (!entry) {
        entry = { jdn: n.dateJDN, items: [] };
        byDay.set(n.dateJDN, entry);
      }
      entry.items.push({ planId: plan.id, cropName: crop.name, label: n.label, key: n.key });
    }
  }
  return [...byDay.values()].filter(d => d.items.length > 2).sort((a, b) => a.jdn - b.jdn);
}
