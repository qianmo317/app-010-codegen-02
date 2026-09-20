import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
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
  type FarmPlan,
  type FarmNode,
  type NodeWarning,
} from '../almanac/schedule';
import { CROP_TEMPLATES, NODE_TYPE_LABEL, type NodeType } from '../almanac/crops';
import { getActiveTerm, getTermNameOnDate } from '../almanac/solar-terms';
import { getWeekDay } from '../utils/date';
import { WEEK_DAYS } from '../almanac/constants';
import { loadPlans, savePlans } from '../services/plan-store';

let stylesInjected = false;

export function renderSchedule(app: HTMLElement) {
  clearElement(app);
  app.className = 'page schedule-page';
  injectStyles();

  let plans = loadPlans();

  // 头部
  const header = createElement('div', 'page-header');
  const backBtn = createElement('button', 'back-btn', '◀ 返回');
  backBtn.addEventListener('click', () => router.navigate('/farm'));
  header.append(backBtn, createElement('h1', 'page-title', '农事排程'));

  const form = createElement('div', 'card schedule-form');
  form.append(buildCreateForm(() => {
    plans = loadPlans();
    renderBody();
  }));

  const banner = createElement('div', 'overload-banner');
  const list = createElement('div', 'plan-list');

  function persist() {
    savePlans(plans);
  }

  function renderBody() {
    clearElement(banner);
    clearElement(list);

    // 跨地块：同一天活超过两件
    const overloads = analyzePlotLoad(plans);
    if (overloads.length > 0) {
      const ul = createElement('div', 'overload-list');
      for (const w of overloads) {
        const item = createElement('div', 'overload-item', `⚠️ ${w.message}`);
        ul.appendChild(item);
      }
      banner.append(createElement('div', 'overload-title', `当日活计冲突（${overloads.length}）`), ul);
    }

    if (plans.length === 0) {
      list.appendChild(createElement('div', 'empty-hint', '还没有安排。在上面选地块、作物和预计采收日，倒推一份从种到收的安排。'));
      return;
    }

    for (const plan of plans) {
      list.appendChild(renderPlanCard(plan));
    }
  }

  function mutate(next: FarmPlan) {
    const idx = plans.findIndex(p => p.id === next.id);
    if (idx >= 0) plans[idx] = next;
    else plans.push(next);
    persist();
    renderBody();
  }

  function renderPlanCard(plan: FarmPlan): HTMLElement {
    const card = createElement('div', 'card plan-card');

    // 标题行
    const head = createElement('div', 'plan-head');
    const title = createElement('div', 'plan-title');
    title.innerHTML = `<span class="plot-name">${escapeHtml(plan.plot)}</span><span class="crop-name">${escapeHtml(plan.cropName)}</span>`;

    const harvestCtl = createElement('label', 'plan-ctl');
    harvestCtl.appendChild(createElement('span', undefined, '采收'));
    const harvestInput = document.createElement('input');
    harvestInput.type = 'date';
    harvestInput.value = plan.harvestDate;
    harvestInput.addEventListener('change', () => {
      if (harvestInput.value && harvestInput.value !== plan.harvestDate) {
        mutate(updateHarvestDate(plan, harvestInput.value));
      }
    });
    harvestCtl.appendChild(harvestInput);

    const growthCtl = createElement('label', 'plan-ctl');
    growthCtl.appendChild(createElement('span', undefined, '生长天数'));
    const growthInput = document.createElement('input');
    growthInput.type = 'number';
    growthInput.min = '1';
    growthInput.max = '400';
    growthInput.value = String(plan.growthDays);
    growthInput.className = 'growth-input';
    growthInput.addEventListener('change', () => {
      const g = Number(growthInput.value);
      if (g > 0 && g <= 400 && g !== plan.growthDays) mutate(updateGrowthDays(plan, g));
    });
    growthCtl.appendChild(growthInput);

    const delPlanBtn = createElement('button', 'link-btn danger', '删除整份');
    delPlanBtn.addEventListener('click', () => {
      if (confirm(`确定删除「${plan.plot} · ${plan.cropName}」的整份安排？`)) {
        plans = plans.filter(p => p.id !== plan.id);
        persist();
        renderBody();
      }
    });

    head.append(title, harvestCtl, growthCtl, delPlanBtn);
    card.appendChild(head);

    // 计划级告警
    const warnings = analyzePlan(plan);
    if (warnings.length > 0) {
      const wBox = createElement('div', 'plan-warnings');
      for (const w of warnings) {
        if (w.code === 'past') continue; // 过期在行内标
        wBox.appendChild(createElement('div', `warn-line ${w.level}`, warnIcon(w) + w.message));
      }
      if (wBox.children.length > 0) card.appendChild(wBox);
    }

    // 节点行
    const warnByNode = new Map<string, NodeWarning[]>();
    for (const w of warnings) {
      if (!w.nodeId) continue;
      const arr = warnByNode.get(w.nodeId) ?? [];
      arr.push(w);
      warnByNode.set(w.nodeId, arr);
    }

    const rows = createElement('div', 'node-rows');
    const sorted = [...plan.nodes].sort((a, b) => a.date.localeCompare(b.date));
    for (const n of sorted) rows.appendChild(renderNodeRow(plan, n, warnByNode.get(n.id) ?? []));
    card.appendChild(rows);

    card.appendChild(buildAddNodeForm(plan));
    return card;
  }

  function renderNodeRow(plan: FarmPlan, n: FarmNode, warnings: NodeWarning[]): HTMLElement {
    const [y, m, d] = n.date.split('-').map(Number);
    const term = getActiveTerm(y, m, d);
    const termDay = getTermNameOnDate(y, m, d);
    const weekday = WEEK_DAYS[getWeekDay(y, m, d)];
    const isPast = warnings.some(w => w.code === 'past');
    const tooClose = warnings.some(w => w.code === 'too-close');

    const row = createElement('div', 'node-row');
    if (isPast) row.classList.add('is-past');
    if (tooClose) row.classList.add('is-close');

    // 左：日期（可改）
    const dateCol = createElement('div', 'node-date-col');
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = n.date;
    dateInput.className = 'node-date-input';
    dateInput.addEventListener('change', () => {
      if (dateInput.value && dateInput.value !== n.date) mutate(updateNodeDate(plan, n.id, dateInput.value));
    });
    const meta = createElement('div', 'node-date-meta', `周${weekday} · ${term}${termDay ? ` · 交${termDay}` : ''}`);
    dateCol.append(dateInput, meta);

    // 中：活名 + 备注 + 偏移
    const main = createElement('div', 'node-main');
    const nameLine = createElement('div', 'node-name-line');
    nameLine.appendChild(createElement('span', 'node-name', nodeName(n)));
    if (n.locked) nameLine.appendChild(createElement('span', 'badge badge-lock', '已锁定'));
    if (n.manual) nameLine.appendChild(createElement('span', 'badge badge-manual', '手动加'));
    if (isPast) nameLine.appendChild(createElement('span', 'badge badge-past', '已过期'));
    if (tooClose) nameLine.appendChild(createElement('span', 'badge badge-close', '挨太近'));
    main.appendChild(nameLine);

    if (n.note) main.appendChild(createElement('div', 'node-note', n.note));
    main.appendChild(createElement('div', 'node-offset', offsetText(n)));

    // 调整原因
    if (n.adjustments.length > 0) {
      const latest = n.adjustments[n.adjustments.length - 1];
      const reason = createElement('div', 'node-reason', `🗓 ${latest.from} → ${latest.to}：${latest.reasons.join('；')}`);
      reason.title = n.adjustments.map(a => `${a.from} → ${a.to}\n${a.reasons.join('\n')}`).join('\n───\n');
      main.appendChild(reason);
    }

    // 行内告警（过期除外，已用徽标）
    for (const w of warnings) {
      if (w.code === 'past') continue;
      main.appendChild(createElement('div', `warn-line ${w.level}`, warnIcon(w) + w.message));
    }

    // 右：操作
    const actions = createElement('div', 'node-actions');
    if (n.locked) {
      const unlockBtn = createElement('button', 'link-btn', '解锁重排');
      unlockBtn.addEventListener('click', () => mutate(unlockNode(plan, n.id)));
      actions.appendChild(unlockBtn);
    }
    if (n.type !== 'sow' && n.type !== 'harvest') {
      const delBtn = createElement('button', 'link-btn danger', '删');
      delBtn.addEventListener('click', () => mutate(removeNode(plan, n.id)));
      actions.appendChild(delBtn);
    }

    row.append(dateCol, main, actions);
    return row;
  }

  function buildAddNodeForm(plan: FarmPlan): HTMLElement {
    const box = createElement('div', 'add-node-box');
    const toggle = createElement('button', 'link-btn', '＋ 加一道活');
    const formBox = createElement('div', 'add-node-form hidden');

    const typeSel = document.createElement('select');
    for (const t of ['thin', 'topdress', 'spray', 'waterControl', 'other'] as NodeType[]) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = NODE_TYPE_LABEL[t];
      typeSel.appendChild(opt);
    }
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = '名称（可选，如：穗肥）';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = plan.harvestDate;
    const okBtn = createElement('button', 'mini-btn', '添加');

    okBtn.addEventListener('click', () => {
      if (!dateInput.value) {
        alert('请选日子');
        return;
      }
      mutate(addNode(plan, {
        type: typeSel.value as NodeType,
        label: labelInput.value.trim() || undefined,
        date: dateInput.value,
      }));
    });

    formBox.append(typeSel, labelInput, dateInput, okBtn);
    toggle.addEventListener('click', () => formBox.classList.toggle('hidden'));
    box.append(toggle, formBox);
    return box;
  }

  app.append(header, form, banner, list);
  renderBody();
}

// ---------- 创建表单 ----------

function buildCreateForm(onCreated: () => void): HTMLElement {
  const box = createElement('div', 'create-form');

  const plotInput = document.createElement('input');
  plotInput.type = 'text';
  plotInput.placeholder = '地块名，如：1号地 / 东坡地';

  const cropSel = document.createElement('select');
  for (const c of CROP_TEMPLATES) {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = `${c.name}（参考 ${c.defaultGrowthDays} 天）`;
    cropSel.appendChild(opt);
  }

  const customRow = createElement('div', 'form-row hidden');
  const customNameInput = document.createElement('input');
  customNameInput.type = 'text';
  customNameInput.placeholder = '作物名称，如：土豆';
  const hardinessSel = document.createElement('select');
  for (const [val, txt] of [['tender', '喜温怕霜（清明后播）'], ['hardy', '耐寒（霜降后播）']] as const) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = txt;
    hardinessSel.appendChild(opt);
  }
  function field(label: string, input: HTMLElement) {
    const wrap = createElement('label', 'field');
    wrap.appendChild(createElement('span', 'field-label', label));
    wrap.appendChild(input);
    return wrap;
  }
  customRow.append(field('自定义名称', customNameInput), field('耐寒类型', hardinessSel));

  const n = new Date();
  const defaultHarvest = `${n.getFullYear() + 1}-09-20`;
  const harvestInput = document.createElement('input');
  harvestInput.type = 'date';
  harvestInput.value = defaultHarvest;

  const growthInput = document.createElement('input');
  growthInput.type = 'number';
  growthInput.min = '1';
  growthInput.max = '400';
  growthInput.value = String(CROP_TEMPLATES[0].defaultGrowthDays);
  growthInput.className = 'growth-input';

  cropSel.addEventListener('change', () => {
    const tpl = CROP_TEMPLATES.find(c => c.key === cropSel.value);
    if (tpl) growthInput.value = String(tpl.defaultGrowthDays);
    customRow.classList.toggle('hidden', cropSel.value !== 'custom');
  });

  const submit = createElement('button', 'submit-btn', '倒推安排');
  submit.addEventListener('click', () => {
    const plot = plotInput.value.trim();
    if (!plot) {
      alert('请填地块名');
      return;
    }
    if (!harvestInput.value) {
      alert('请选预计采收日');
      return;
    }
    const growthDays = Number(growthInput.value);
    if (!(growthDays > 0) || growthDays > 400) {
      alert('生长天数需在 1-400 之间');
      return;
    }
    const cropKey = cropSel.value;
    const plans = loadPlans();
    plans.push(createPlan({
      plot,
      cropKey,
      cropName: cropKey === 'custom' ? customNameInput.value.trim() || '自定义作物' : undefined,
      hardiness: cropKey === 'custom' ? (hardinessSel.value as 'tender' | 'hardy') : undefined,
      growthDays,
      harvestDate: harvestInput.value,
    }));
    savePlans(plans);
    plotInput.value = '';
    onCreated();
  });

  const row1 = createElement('div', 'form-row');
  row1.append(field('地块', plotInput), field('作物', cropSel));
  const row2 = createElement('div', 'form-row');
  row2.append(field('打算哪天收', harvestInput), field('要长多少天', growthInput));
  box.append(createElement('h3', undefined, '新开一份安排'), row1, customRow, row2, submit);
  return box;
}

// ---------- 小工具 ----------

function offsetText(n: FarmNode): string {
  if (n.type === 'sow') return `按采收倒推 · 收前 ${Math.abs(n.offsetDays)} 天`;
  if (n.type === 'harvest') return '目标采收日';
  if (n.base === 'sow') return `播后 ${n.offsetDays} 天`;
  return `收前 ${Math.abs(n.offsetDays)} 天`;
}

function warnIcon(w: NodeWarning): string {
  if (w.level === 'error') return '⛔ ';
  if (w.level === 'warn') return '⚠️ ';
  return 'ℹ️ ';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .hidden { display: none !important; }
    .overload-banner { margin-bottom: 16px; }
    .overload-title { font-weight: bold; color: var(--accent); margin-bottom: 6px; }
    .overload-item {
      background: #fff4e5; border: 1px solid #f0b46a; color: #8a4b00;
      border-radius: 8px; padding: 8px 12px; margin-bottom: 6px; font-size: 14px;
    }
    .empty-hint { color: var(--text-light); text-align: center; padding: 40px 0; font-size: 14px; }

    .create-form h3 { color: var(--primary); margin-bottom: 14px; font-size: 16px; }
    .form-row { display: flex; gap: 12px; margin-bottom: 14px; }
    .field { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 13px; color: var(--primary); font-weight: bold; }
    .field input, .field select, .add-node-form input, .add-node-form select {
      padding: 9px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: white;
    }
    .growth-input { max-width: 110px; }

    .plan-list { display: grid; gap: 16px; }
    .plan-card { padding: 16px; }
    .plan-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
    .plan-title { display: flex; flex-direction: column; margin-right: auto; }
    .plot-name { font-size: 18px; font-weight: bold; color: var(--primary); }
    .crop-name { font-size: 13px; color: var(--text-light); }
    .plan-ctl { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-light); }
    .plan-ctl input { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }

    .plan-warnings { margin: 8px 0; display: grid; gap: 4px; }
    .warn-line { font-size: 13px; padding: 5px 10px; border-radius: 6px; }
    .warn-line.warn { background: #fff4e5; color: #8a4b00; }
    .warn-line.error { background: #ffebee; color: #a01b2c; }
    .warn-line.info { background: #eef4fb; color: #2b5b8a; }

    .node-rows { border-top: 1px dashed var(--border); margin-top: 6px; }
    .node-row {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 10px 4px; border-bottom: 1px dashed var(--border);
    }
    .node-row.is-past { opacity: 0.62; }
    .node-row.is-close { background: #fff8f0; border-radius: 8px; }
    .node-date-col { min-width: 150px; }
    .node-date-input {
      border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; font-size: 14px; width: 150px;
      background: white;
    }
    .node-date-meta { font-size: 12px; color: var(--secondary); margin-top: 3px; }
    .node-main { flex: 1; min-width: 0; }
    .node-name-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .node-name { font-weight: bold; font-size: 15px; }
    .node-note { font-size: 12px; color: var(--text-light); margin-top: 2px; }
    .node-offset { font-size: 12px; color: #8a7a5c; margin-top: 2px; }
    .node-reason {
      font-size: 12px; color: #5b3f8c; background: #f3eff9; border-radius: 6px;
      padding: 5px 8px; margin-top: 5px;
    }
    .node-actions { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
    .link-btn {
      border: none; background: none; color: var(--primary); cursor: pointer;
      font-size: 13px; padding: 2px 6px; text-decoration: underline;
    }
    .link-btn.danger { color: var(--accent); }
    .badge {
      font-size: 11px; padding: 1px 8px; border-radius: 10px; line-height: 1.6; white-space: nowrap;
    }
    .badge-lock { background: #e6e0d4; color: #6b5d44; }
    .badge-manual { background: #e3f2fd; color: #1565c0; }
    .badge-past { background: #eceff1; color: #607d8b; }
    .badge-close { background: #ffe0b2; color: #bf5200; }

    .add-node-box { margin-top: 10px; }
    .add-node-form { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
    .add-node-form.hidden { display: none; }
    .add-node-form input { flex: 1; min-width: 150px; }
    .mini-btn {
      padding: 8px 16px; background: var(--secondary); color: white; border: none;
      border-radius: 6px; cursor: pointer; font-size: 13px;
    }

    @media (max-width: 600px) {
      .form-row { flex-direction: column; }
      .node-row { flex-wrap: wrap; }
      .node-date-col { min-width: 0; }
      .plan-head { gap: 8px; }
    }
  `;
  document.head.appendChild(style);
}
