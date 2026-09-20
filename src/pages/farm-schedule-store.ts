// 本地存储：地块 + 每块地的作物计划（纯 localStorage，离线可用）

import { PlotPlan, createPlan, updateHarvestDate, setNodeDate, unlockNode, toggleLock, deleteNode, addNode, AddNodeInput } from '../almanac/farm-plan';
import { CROPS, CropDef, getCrop } from '../almanac/crops';

const STORAGE_KEY = 'farm-schedule-v1';

export interface Plot {
  id: string;
  name: string;
  planIds: string[];
}

export interface ScheduleState {
  plots: Plot[];
  plans: PlotPlan[];
}

export function cropOf(plan: PlotPlan): CropDef {
  return getCrop(plan.cropId) ?? CROPS[0];
}

function emptyState(): ScheduleState {
  return { plots: [], plans: [] };
}

export function loadState(): ScheduleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as ScheduleState;
    if (!parsed.plots || !parsed.plans) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state: ScheduleState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let seq = 0;
export function genId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

// 首次使用时放一份示例：一块地、一份春玉米计划，收获日选将来的日期
export function seedIfEmpty(state: ScheduleState): ScheduleState {
  if (state.plots.length > 0) return state;
  const plot: Plot = { id: genId('plot'), name: '一号地', planIds: [] };
  const harvest = new Date(Date.now() + 90 * 86400000);
  const harvestISO = `${harvest.getFullYear()}-${String(harvest.getMonth() + 1).padStart(2, '0')}-${String(harvest.getDate()).padStart(2, '0')}`;
  const plan = createPlan(genId('plan'), plot.id, CROPS[0], harvestISO);
  plot.planIds.push(plan.id);
  return { plots: [plot], plans: [plan] };
}

export function addPlot(state: ScheduleState, name: string): { state: ScheduleState; plotId: string } {
  const plot: Plot = { id: genId('plot'), name: name.trim() || `地块${state.plots.length + 1}`, planIds: [] };
  return { state: { ...state, plots: [...state.plots, plot] }, plotId: plot.id };
}

export function renamePlot(state: ScheduleState, plotId: string, name: string): ScheduleState {
  return {
    ...state,
    plots: state.plots.map(p => p.id === plotId ? { ...p, name } : p),
  };
}

export function deletePlot(state: ScheduleState, plotId: string): ScheduleState {
  const removeIds = new Set(state.plots.find(p => p.id === plotId)?.planIds ?? []);
  return {
    plots: state.plots.filter(p => p.id !== plotId),
    plans: state.plans.filter(p => !removeIds.has(p.id)),
  };
}

export function addPlan(state: ScheduleState, plotId: string, crop: CropDef, harvestISO: string): { state: ScheduleState; planId: string } {
  const id = genId('plan');
  const plan = createPlan(id, plotId, crop, harvestISO);
  return {
    state: {
      plans: [...state.plans, plan],
      plots: state.plots.map(p => p.id === plotId ? { ...p, planIds: [...p.planIds, id] } : p),
    },
    planId: id,
  };
}

export function deletePlan(state: ScheduleState, planId: string): ScheduleState {
  return {
    plans: state.plans.filter(p => p.id !== planId),
    plots: state.plots.map(p => ({ ...p, planIds: p.planIds.filter(id => id !== planId) })),
  };
}

type Mutate = (plan: PlotPlan) => PlotPlan;

function mutatePlan(state: ScheduleState, planId: string, fn: Mutate): ScheduleState {
  return { ...state, plans: state.plans.map(p => p.id === planId ? fn(p) : p) };
}

export const planOps = {
  setHarvest: (state: ScheduleState, planId: string, iso: string) =>
    mutatePlan(state, planId, p => updateHarvestDate(p, iso)),
  setNodeDate: (state: ScheduleState, planId: string, nodeId: string, iso: string) =>
    mutatePlan(state, planId, p => setNodeDate(p, nodeId, iso)),
  unlockNode: (state: ScheduleState, planId: string, nodeId: string, crop: CropDef) =>
    mutatePlan(state, planId, p => unlockNode(p, crop, nodeId)),
  toggleLock: (state: ScheduleState, planId: string, nodeId: string) =>
    mutatePlan(state, planId, p => toggleLock(p, nodeId)),
  deleteNode: (state: ScheduleState, planId: string, nodeId: string) =>
    mutatePlan(state, planId, p => deleteNode(p, nodeId)),
  addNode: (state: ScheduleState, planId: string, input: AddNodeInput) =>
    mutatePlan(state, planId, p => addNode(p, input)),
};
