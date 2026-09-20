// 农事排程本地持久化（localStorage，纯离线）
import type { FarmPlan } from '../almanac/schedule';

const STORAGE_KEY = 'farm-schedule-plans-v1';

export function loadPlans(): FarmPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data as FarmPlan[];
  } catch {
    return [];
  }
}

export function savePlans(plans: FarmPlan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // 隐私模式或配额超限时静默失败，不影响当前会话
  }
}

export function clearPlans(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
