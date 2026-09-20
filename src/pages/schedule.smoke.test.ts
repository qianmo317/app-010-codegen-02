// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSchedule } from './schedule';

// jsdom 不实现 prompt/confirm/alert
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('prompt', vi.fn(() => null));
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('alert', vi.fn());
});

function click(el: Element | null) {
  if (!el) throw new Error('missing element');
  (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('农事排活页面（jsdom）', () => {
  it('首次渲染有示例地块、作物和六个节点', () => {
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderSchedule(app);

    expect(app.textContent).toContain('农事排活');
    expect(app.textContent).toContain('一号地');
    expect(app.textContent).toContain('春玉米');
    ['播种', '间苗', '追肥', '打药', '控水', '收获'].forEach(label => {
      expect(app.textContent).toContain(label);
    });
    // 节气对照：至少有一个节气名出现（收获日或调整说明里）
    expect(app.querySelectorAll('.timeline').length).toBe(1);
    expect(app.querySelectorAll('.node-row').length).toBe(6);
  });

  it('新增一块地', () => {
    const app = document.createElement('div');
    renderSchedule(app);
    const input = app.querySelector('.schedule-plotbar input') as HTMLInputElement;
    input.value = '南坡地';
    click(app.querySelector('.schedule-add-btn'));
    expect(app.textContent).toContain('南坡地');
    // 已持久化
    expect(localStorage.getItem('farm-schedule-v1')).toContain('南坡地');
  });

  it('给地块再排一份作物', () => {
    const app = document.createElement('div');
    renderSchedule(app);
    const before = app.querySelectorAll('.plan-box').length;
    click(app.querySelector('.add-crop-bar .mini-btn'));
    expect(app.querySelectorAll('.plan-box').length).toBe(before + 1);
  });

  it('新增一件自定义农活，节点变多', () => {
    const app = document.createElement('div');
    renderSchedule(app);
    const nameInput = app.querySelector('.add-task-bar input[type=text]') as HTMLInputElement;
    const dateInput = app.querySelector('.add-task-bar input[type=date]') as HTMLInputElement;
    nameInput.value = '锄草';
    dateInput.value = '2030-07-01';
    click(app.querySelector('.add-task-bar .mini-btn'));
    expect(app.textContent).toContain('锄草');
    expect(app.querySelectorAll('.node-row').length).toBe(7);
    expect(app.textContent).toContain('自定义');
  });

  it('改收获日后页面重渲染且持久化', () => {
    const app = document.createElement('div');
    renderSchedule(app);
    const harvest = app.querySelector('.harvest-input') as HTMLInputElement;
    harvest.value = '2030-09-30';
    harvest.dispatchEvent(new Event('change', { bubbles: true }));
    const after = app.querySelector('.harvest-input') as HTMLInputElement;
    expect(after.value).toBe('2030-09-30');
    expect(localStorage.getItem('farm-schedule-v1')).toContain('2030-09-30');
  });

  it('删除自定义农活后节点减少', () => {
    const app = document.createElement('div');
    renderSchedule(app);
    // 先加
    const nameInput = app.querySelector('.add-task-bar input[type=text]') as HTMLInputElement;
    const dateInput = app.querySelector('.add-task-bar input[type=date]') as HTMLInputElement;
    nameInput.value = '搭架';
    dateInput.value = '2030-07-01';
    click(app.querySelector('.add-task-bar .mini-btn'));
    expect(app.querySelectorAll('.node-row').length).toBe(7);
    // 找到搭架那行的删除按钮（收获没有删按钮）
    const rows = [...app.querySelectorAll('.node-row')];
    const target = rows.find(r => r.textContent?.includes('搭架'))!;
    click(target.querySelector('.mini-btn.danger'));
    expect(app.querySelectorAll('.node-row').length).toBe(6);
  });

  it('刷新后从 localStorage 恢复', () => {
    const app1 = document.createElement('div');
    renderSchedule(app1);
    const input = app1.querySelector('.schedule-plotbar input') as HTMLInputElement;
    input.value = '自留地';
    click(app1.querySelector('.schedule-add-btn'));

    const app2 = document.createElement('div');
    renderSchedule(app2);
    expect(app2.textContent).toContain('自留地');
    expect(app2.textContent).toContain('一号地');
  });
});
