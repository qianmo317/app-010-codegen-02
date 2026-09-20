import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { WEEK_DAYS } from '../almanac/constants';
import { CROPS, getCrop } from '../almanac/crops';
import {
  resolvePlan, aggregatePlotDays, jdnToISO, todayJDN,
} from '../almanac/farm-plan';
import {
  ScheduleState, loadState, saveState, seedIfEmpty, addPlot, deletePlot,
  renamePlot, addPlan, deletePlan, planOps, cropOf,
} from './farm-schedule-store';

export function renderSchedule(app: HTMLElement) {
  let state = seedIfEmpty(loadState());
  saveState(state);

  function commit(next: ScheduleState) {
    state = next;
    saveState(state);
    render();
  }

  function render() {
    clearElement(app);
    app.className = 'page schedule-page';

    // 头部
    const header = createElement('div', 'page-header');
    const backBtn = createElement('button', 'back-btn', '◀ 返回');
    backBtn.addEventListener('click', () => router.navigate('/'));
    const title = createElement('h1', 'page-title', '农事排活');
    header.append(backBtn, title);

    // 说明条
    const intro = createElement('div', 'card schedule-intro');
    intro.innerHTML = `
      <h3>怎么用</h3>
      <p>给每块地每种作物选一个<b>计划收获日</b>，系统按作物要长的天数往前推出
      <b>播种·间苗·追肥·打药·控水</b>的日子，并跟当年二十四节气对一遍：
      撞在不宜节气上的会就近调开并说明原因；<span class="tag-warn">过期</span>、
      <span class="tag-warn">挨太近</span>的单独标出。节点可以改日子（自动锁定）、解锁、增删，
      改动后后续节点重排。同一块地同一天超过两件活会在顶部提示。</p>`;

    // 新增地块
    const plotBar = createElement('div', 'schedule-plotbar');
    const plotInput = document.createElement('input');
    plotInput.type = 'text';
    plotInput.placeholder = '新地块名字，如「南坡地」';
    plotInput.className = 'schedule-input';
    const addPlotBtn = createElement('button', 'submit-btn schedule-add-btn', '＋ 新增地块');
    addPlotBtn.addEventListener('click', () => {
      const r = addPlot(state, plotInput.value);
      plotInput.value = '';
      commit(r.state);
    });
    plotBar.append(plotInput, addPlotBtn);

    app.append(header, intro, plotBar);

    if (state.plots.length === 0) {
      app.appendChild(createElement('div', 'empty-hint', '还没有地块，先加一块地吧'));
      return;
    }

    for (const plot of state.plots) {
      app.appendChild(renderPlot(plot.id, plot.name));
    }
  }

  function renderPlot(plotId: string, plotName: string): HTMLElement {
    const wrap = createElement('div', 'card plot-card');
    const plotHead = createElement('div', 'plot-head');
    const nameEl = createElement('h3', 'plot-name', `🌾 ${plotName}`);
    const tools = createElement('div', 'plot-tools');

    const renameBtn = createElement('button', 'mini-btn', '改名');
    renameBtn.addEventListener('click', () => {
      const name = prompt('地块名字', plotName);
      if (name && name.trim()) commit(renamePlot(state, plotId, name.trim()));
    });
    const delPlotBtn = createElement('button', 'mini-btn danger', '删地块');
    delPlotBtn.addEventListener('click', () => {
      if (confirm(`确定删除「${plotName}」及其全部作物安排？`)) commit(deletePlot(state, plotId));
    });
    tools.append(renameBtn, delPlotBtn);
    plotHead.append(nameEl, tools);
    wrap.appendChild(plotHead);

    const plansHere = state.plans.filter(p => p.plotId === plotId);
    const pairs = plansHere.map(plan => ({ plan, crop: cropOf(plan) }));

    // 同一天超过两件活
    const overload = aggregatePlotDays(pairs, plotId);
    if (overload.length > 0) {
      const box = createElement('div', 'alert-box overload-box');
      box.appendChild(createElement('div', 'alert-title', `⚠ 同一块地有 ${overload.length} 天排了超过两件活`));
      overload.forEach(d => {
        const row = createElement('div', 'overload-row');
        row.innerHTML = `<span class="overload-date">${formatDay(d.jdn)}</span>
          <span class="overload-items">${d.items.map(it => `${it.cropName}·${it.label}`).join('、')}（共 ${d.items.length} 件）</span>`;
        box.appendChild(row);
      });
      wrap.appendChild(box);
    }

    // 各作物计划
    plansHere.forEach(plan => {
      wrap.appendChild(renderPlan(plan.id));
    });

    // 新增作物
    const addBar = createElement('div', 'add-crop-bar');
    const cropSelect = document.createElement('select');
    cropSelect.className = 'schedule-input';
    CROPS.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name}（约${c.growthDays}天）`;
      cropSelect.appendChild(opt);
    });
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'schedule-input';
    dateInput.value = defaultFutureISO(60);
    const addCropBtn = createElement('button', 'mini-btn primary', '＋ 排一份作物');
    addCropBtn.addEventListener('click', () => {
      if (!dateInput.value) { alert('请选择计划收获日'); return; }
      const crop = getCrop(cropSelect.value)!;
      const r = addPlan(state, plotId, crop, dateInput.value);
      commit(r.state);
    });
    addBar.append(cropSelect, dateInput, addCropBtn);
    wrap.appendChild(addBar);

    return wrap;
  }

  function renderPlan(planId: string): HTMLElement {
    const plan = state.plans.find(p => p.id === planId)!;
    const crop = cropOf(plan);
    const resolved = resolvePlan(plan, crop);
    const box = createElement('div', 'plan-box');

    // 作物标题行
    const head = createElement('div', 'plan-head');
    const titleEl = createElement('span', 'plan-title', `${crop.name}`);
    if (crop.note) titleEl.title = crop.note;
    const harvestLabel = createElement('span', 'plan-sub', `经验生长期 ${crop.growthDays} 天`);

    const harvestInput = document.createElement('input');
    harvestInput.type = 'date';
    harvestInput.className = 'harvest-input';
    harvestInput.value = plan.harvestISO;
    harvestInput.addEventListener('change', () => {
      if (harvestInput.value) commit(planOps.setHarvest(state, planId, harvestInput.value));
    });
    const harvestWrap = createElement('label', 'harvest-wrap');
    harvestWrap.append(createElement('span', 'harvest-cap', '计划收获日'), harvestInput);
    if (resolved.harvestTerm) {
      harvestWrap.appendChild(createElement('span', 'term-chip', resolved.harvestTerm));
    }

    const delBtn = createElement('button', 'mini-btn danger', '删除');
    delBtn.addEventListener('click', () => {
      if (confirm(`删除「${crop.name}」这份安排？`)) commit(deletePlan(state, planId));
    });

    head.append(titleEl, harvestLabel, harvestWrap, delBtn);
    box.appendChild(head);

    // 计划级提示
    const planWarns = resolved.flags.filter(f => !f.nodeId);
    planWarns.forEach(f => box.appendChild(flagLine(f.level, f.text)));

    // 节点时间轴
    const timeline = createElement('div', 'timeline');
    resolved.nodes.forEach(n => {
      timeline.appendChild(renderNode(planId, n.id, n.key, n.label, n.dateJDN, n.termName, n.locked, !!n.custom, n.flags));
    });
    box.appendChild(timeline);

    // 新增自定义农活
    const addTaskBar = createElement('div', 'add-task-bar');
    const taskName = document.createElement('input');
    taskName.type = 'text';
    taskName.placeholder = '农活名称，如「锄草」';
    taskName.className = 'schedule-input';
    const taskDate = document.createElement('input');
    taskDate.type = 'date';
    taskDate.className = 'schedule-input';
    taskDate.value = defaultFutureISO(30);
    const addTaskBtn = createElement('button', 'mini-btn', '＋ 加一件活');
    addTaskBtn.addEventListener('click', () => {
      if (!taskName.value.trim() || !taskDate.value) { alert('填农活名称和日期'); return; }
      commit(planOps.addNode(state, planId, { label: taskName.value.trim(), dateISO: taskDate.value }));
    });
    addTaskBar.append(taskName, taskDate, addTaskBtn);
    box.appendChild(addTaskBar);

    return box;
  }

  function renderNode(
    planId: string, nodeId: string, key: string, label: string,
    dateJDN: number, termName: string | undefined, locked: boolean, custom: boolean, flags: Array<{ level: string; text: string }>,
  ): HTMLElement {
    const row = createElement('div', `node-row ${key === 'harvest' ? 'is-harvest' : ''}`);

    const dot = createElement('div', `node-dot phase-${key}`);
    const main = createElement('div', 'node-main');

    const line1 = createElement('div', 'node-line1');
    const name = createElement('span', 'node-label', label);
    if (locked) name.appendChild(createElement('span', 'lock-badge', '🔒锁定'));
    if (custom) name.appendChild(createElement('span', 'custom-badge', '自定义'));
    const dateEdit = document.createElement('input');
    dateEdit.type = 'date';
    dateEdit.className = 'node-date-input';
    dateEdit.value = jdnToISO(dateJDN);
    dateEdit.addEventListener('change', () => {
      if (dateEdit.value) commit(planOps.setNodeDate(state, planId, nodeId, dateEdit.value));
    });
    const weekday = createElement('span', 'node-weekday', `周${WEEK_DAYS[weekdayOfJDN(dateJDN)]}`);
    const termChip = termName ? createElement('span', 'term-chip strong', termName) : createElement('span');
    line1.append(name, dateEdit, weekday, termChip);

    main.appendChild(line1);

    // 节点标记
    flags.forEach(f => main.appendChild(flagLine(f.level as 'warn' | 'info', f.text)));

    // 操作按钮
    const ops = createElement('div', 'node-ops');
    if (key !== 'harvest') {
      if (locked && key !== 'custom') {
        const unlockBtn = createElement('button', 'mini-btn', '解锁跟随');
        unlockBtn.addEventListener('click', () => {
          const plan = state.plans.find(p => p.id === planId)!;
          commit(planOps.unlockNode(state, planId, nodeId, cropOf(plan)));
        });
        ops.appendChild(unlockBtn);
      } else {
        const lockBtn = createElement('button', 'mini-btn', locked ? '解锁' : '锁定');
        lockBtn.addEventListener('click', () => commit(planOps.toggleLock(state, planId, nodeId)));
        ops.appendChild(lockBtn);
      }
      const delBtn = createElement('button', 'mini-btn danger', '删');
      delBtn.addEventListener('click', () => commit(planOps.deleteNode(state, planId, nodeId)));
      ops.appendChild(delBtn);
    }

    row.append(dot, main, ops);
    return row;
  }

  function flagLine(level: 'warn' | 'info', text: string): HTMLElement {
    const el = createElement('div', `flag-line flag-${level}`);
    el.textContent = `${level === 'warn' ? '⚠' : 'ℹ'} ${text}`;
    return el;
  }

  function formatDay(jdn: number): string {
    const iso = jdnToISO(jdn);
    return `${iso} 周${WEEK_DAYS[weekdayOfJDN(jdn)]}`;
  }

  render();
}

function weekdayOfJDN(jdn: number): number {
  return (jdn + 1) % 7;
}

function defaultFutureISO(daysFromNow: number): string {
  const t = todayJDN() + daysFromNow;
  return jdnToISO(t);
}
