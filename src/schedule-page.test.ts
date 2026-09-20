// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderSchedule } from './pages/schedule';
import * as store from './services/plan-store';

function fireChange(el: Element, value: string) {
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('农事排程页面（jsdom 冒烟）', () => {
  beforeEach(() => localStorage.clear());

  it('渲染、创建、改采收日连锁、超载提示、删除整份', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = document.getElementById('app')!;

    // 首次渲染（空态）
    renderSchedule(app);
    expect(app.textContent).toContain('农事排程');
    expect(app.textContent).toContain('还没有安排');

    // 填表创建：地块、采收日、生长天数走默认（春玉米 / 次年 9-20 / 110）
    const plotInput = app.querySelector('.field input') as HTMLInputElement;
    plotInput.value = '1号地';
    plotInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    const harvestInput = app.querySelector('.create-form input[type=date]') as HTMLInputElement;
    fireChange(harvestInput, '2027-09-20');

    app.querySelector('.create-form .submit-btn')!.dispatchEvent(new window.Event('click', { bubbles: true }));

    // 卡片出现且持久化
    expect(store.loadPlans()).toHaveLength(1);
    expect(app.textContent).toContain('1号地');
    expect(app.textContent).toContain('春玉米');
    // 节点行（播种…采收）
    expect(app.querySelectorAll('.node-row').length).toBeGreaterThanOrEqual(6);

    // 改采收日 -> 触发连锁重推
    const cardHarvest = app.querySelector('.plan-ctl input[type=date]') as HTMLInputElement;
    fireChange(cardHarvest, '2027-10-01');
    expect(store.loadPlans()[0].harvestDate).toBe('2027-10-01');

    // 加两道与现有同日的活，制造超载（找一个已有节点日期）
    const firstDate = (app.querySelector('.node-date-input') as HTMLInputElement).value;
    const countOn = (date: string) => store.loadPlans()[0].nodes.filter(n => n.date === date).length;
    // 每次添加都会整列表重渲染，需重新展开表单、重新取节点
    let guard = 0;
    while (countOn(firstDate) < 3 && guard < 10) {
      guard++;
      (app.querySelector('.add-node-box .link-btn') as HTMLButtonElement).dispatchEvent(new window.Event('click', { bubbles: true }));
      const form = app.querySelector('.add-node-form') as HTMLElement;
      const addDate = form.querySelector('input[type=date]') as HTMLInputElement;
      fireChange(addDate, firstDate);
      (form.querySelector('.mini-btn') as HTMLButtonElement).dispatchEvent(new window.Event('click', { bubbles: true }));
    }
    expect(countOn(firstDate)).toBe(3);
    expect(app.textContent).toContain('超过两件');

    // 删除整份
    window.confirm = () => true;
    (app.querySelector('.plan-head .danger') as HTMLButtonElement).dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(store.loadPlans()).toHaveLength(0);
    expect(app.textContent).toContain('还没有安排');
  });
});
