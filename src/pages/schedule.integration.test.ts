// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';
import { renderSchedule } from './schedule';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('prompt', vi.fn(() => null));
});

function click(el: Element | null) {
  if (!el) throw new Error('missing element');
  (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

it('真实场景：三份撞期作物同时展示霜降避让、过期与同日超载', () => {
  const app = document.createElement('div');
  document.body.appendChild(app);
  renderSchedule(app);

  // 把示例计划收获日改成 2025-02-20（播种 = 2024-10-23 霜降，已过）
  function setLastHarvest(value: string) {
    const harvests = app.querySelectorAll('.harvest-input') as NodeListOf<HTMLInputElement>;
    const last = harvests[harvests.length - 1];
    last.value = value;
    last.dispatchEvent(new Event('change', { bubbles: true }));
  }
  setLastHarvest('2025-02-20');

  // 再排两份同样收获日的作物
  for (let i = 0; i < 2; i++) {
    const addBtns = app.querySelectorAll('.add-crop-bar .mini-btn');
    click(addBtns[addBtns.length - 1]);
    setLastHarvest('2025-02-20');
  }

  // 三份计划
  expect(app.querySelectorAll('.plan-box').length).toBe(3);

  // 同日超载：收获日三件活
  const overloadText = app.querySelector('.overload-box')!.textContent!;
  expect(overloadText).toContain('2025-02-20');
  expect(overloadText).toContain('共 3 件');

  // 霜降避让说明（每份都有，共 3 条调整信息）
  expect(app.textContent).toContain('撞上「霜降」前后不宜，已挪到');
  expect(app.querySelectorAll('.flag-info').length).toBe(3);

  // 过期警告（3 份 × 6 个已过节点）与收获已过
  expect(app.querySelectorAll('.flag-warn').length).toBeGreaterThanOrEqual(18);
  expect(app.textContent).toContain('计划收获日 2025-02-20 已经过了');
});
