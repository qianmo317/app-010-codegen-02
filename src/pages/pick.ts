import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { pickDays, categorizeResults, PickResult } from '../almanac/pick-day';
import { EVENT_WEIGHTS } from '../almanac/yiji';
import html2canvas from 'html2canvas';

export function renderPick(app: HTMLElement) {
  clearElement(app);
  app.className = 'page pick-page';

  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultEnd = `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 头部
  const header = createElement('div', 'page-header');
  const backBtn = createElement('button', 'back-btn', '◀ 返回');
  backBtn.addEventListener('click', () => router.navigate('/'));
  const title = createElement('h1', 'page-title', '择日向导');
  header.append(backBtn, title);

  // 表单
  const form = createElement('div', 'pick-form');

  // 事项选择
  const eventsSection = createElement('div', 'form-section');
  eventsSection.innerHTML = '<label>选择事项（可多选）</label>';
  const eventsGrid = createElement('div', 'events-grid');
  const selectedEvents = new Set<string>();

  Object.keys(EVENT_WEIGHTS).forEach(event => {
    const btn = createElement('button', 'event-btn', event);
    btn.addEventListener('click', () => {
      if (selectedEvents.has(event)) {
        selectedEvents.delete(event);
        btn.classList.remove('selected');
      } else {
        selectedEvents.add(event);
        btn.classList.add('selected');
      }
    });
    eventsGrid.appendChild(btn);
  });
  eventsSection.appendChild(eventsGrid);

  // 日期范围
  const dateSection = createElement('div', 'form-section');
  dateSection.innerHTML = `
    <label>日期范围</label>
    <div class="date-range">
      <input type="date" id="start-date" value="${defaultStart}">
      <span>至</span>
      <input type="date" id="end-date" value="${defaultEnd}">
    </div>
  `;

  // 避讳
  const avoidSection = createElement('div', 'form-section');
  avoidSection.innerHTML = `
    <label>避讳生肖（可选，多选用逗号分隔）</label>
    <input type="text" id="avoid-shengxiao" placeholder="如：鼠,马,鸡">
  `;

  // 提交按钮
  const submitBtn = createElement('button', 'submit-btn', '开始择日');

  form.append(eventsSection, dateSection, avoidSection, submitBtn);

  // 结果区域
  const resultArea = createElement('div', 'result-area');

  submitBtn.addEventListener('click', () => {
    if (selectedEvents.size === 0) {
      alert('请至少选择一个事项');
      return;
    }

    const startDate = (document.getElementById('start-date') as HTMLInputElement).value;
    const endDate = (document.getElementById('end-date') as HTMLInputElement).value;
    const avoidInput = (document.getElementById('avoid-shengxiao') as HTMLInputElement).value;
    const avoidShengxiao = avoidInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);

    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);

    const startTime = performance.now();
    const results = pickDays(sy, sm, sd, ey, em, ed, Array.from(selectedEvents), avoidShengxiao);
    const endTime = performance.now();

    renderResults(resultArea, results, endTime - startTime);
  });

  app.append(header, form, resultArea);
}

function renderResults(container: HTMLElement, results: PickResult[], elapsed: number) {
  clearElement(container);

  const { best, good, normal, bad } = categorizeResults(results);

  const stats = createElement('div', 'result-stats');
  stats.innerHTML = `
    <span>大吉 ${best.length} 天</span>
    <span>吉 ${good.length} 天</span>
    <span>平 ${normal.length} 天</span>
    <span>凶 ${bad.length} 天</span>
    <span class="elapsed">计算耗时 ${elapsed.toFixed(1)}ms</span>
  `;
  container.appendChild(stats);

  // 最佳日期
  if (best.length > 0) {
    const bestSection = createElement('div', 'result-section');
    bestSection.innerHTML = '<h3 class="section-title best">大吉之日</h3>';
    const grid = createElement('div', 'result-grid');
    best.forEach(r => grid.appendChild(createResultCard(r)));
    bestSection.appendChild(grid);
    container.appendChild(bestSection);
  }

  // 吉日
  if (good.length > 0) {
    const goodSection = createElement('div', 'result-section');
    goodSection.innerHTML = '<h3 class="section-title good">吉日</h3>';
    const grid = createElement('div', 'result-grid');
    good.slice(0, 20).forEach(r => grid.appendChild(createResultCard(r)));
    goodSection.appendChild(grid);
    container.appendChild(goodSection);
  }

  // 导出按钮
  const exportBtn = createElement('button', 'export-btn', '导出吉日清单') as HTMLButtonElement;
  exportBtn.addEventListener('click', () => {
    exportBtn.textContent = '生成图片中...';
    exportBtn.disabled = true;
    exportResults(results).finally(() => {
      exportBtn.textContent = '导出吉日清单';
      exportBtn.disabled = false;
    });
  });
  container.appendChild(exportBtn);
}

function createResultCard(result: PickResult): HTMLElement {
  const card = createElement('div', `result-card score-${Math.floor(result.score / 20)}`);
  card.innerHTML = `
    <div class="result-date">${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}</div>
    <div class="result-ganzhi">${result.ganZhi}日</div>
    <div class="result-score">${result.score}分</div>
    <div class="result-reason">${result.reason}</div>
    <div class="result-yi">${result.yi.slice(0, 4).map(y => `<span>${y}</span>`).join('')}</div>
  `;
  card.addEventListener('click', () => {
    router.navigate(`/day/${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}`);
  });
  return card;
}

async function exportResults(results: PickResult[]) {
  const goodResults = results.filter(r => r.score >= 60).slice(0, 50);
  if (goodResults.length === 0) {
    alert('没有可导出的吉日');
    return;
  }

  // 创建离屏容器用于生成图片
  const exportContainer = document.createElement('div');
  exportContainer.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 360px;
    background: #f7f3e9;
    padding: 24px;
    font-family: "Noto Serif SC", "Source Han Serif SC", serif;
    color: #333;
  `;

  const title = document.createElement('h2');
  title.style.cssText = 'text-align: center; margin: 0 0 16px 0; color: #c41e3a; font-size: 22px; letter-spacing: 4px;';
  title.textContent = '择日吉日清单';

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'text-align: center; font-size: 12px; color: #888; margin-bottom: 20px;';
  subtitle.textContent = `共 ${goodResults.length} 个吉日 · ${new Date().toLocaleDateString('zh-CN')}`;

  const seal = document.createElement('div');
  seal.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border: 2px solid #c41e3a;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c41e3a;
    font-size: 11px;
    font-weight: bold;
    transform: rotate(-12deg);
    opacity: 0.8;
  `;
  seal.textContent = '大吉';

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

  goodResults.forEach((r) => {
    const item = document.createElement('div');
    const scoreColor = r.score >= 80 ? '#c41e3a' : r.score >= 60 ? '#d4a017' : '#666';
    item.style.cssText = `
      background: #fff;
      border-radius: 8px;
      padding: 12px;
      border-left: 4px solid ${scoreColor};
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    `;
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 16px; font-weight: bold;">${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}</span>
        <span style="font-size: 14px; color: ${scoreColor}; font-weight: bold;">${r.score}分</span>
      </div>
      <div style="font-size: 13px; color: #666; margin-bottom: 4px;">${r.ganZhi}日 · ${r.reason}</div>
      <div style="font-size: 12px; color: #888;">宜：${r.yi.slice(0, 5).join('、')}</div>
    `;
    list.appendChild(item);
  });

  const footer = document.createElement('div');
  footer.style.cssText = 'text-align: center; margin-top: 20px; font-size: 11px; color: #aaa;';
  footer.textContent = '老黄历择日 · 仅供参考';

  exportContainer.appendChild(seal);
  exportContainer.appendChild(title);
  exportContainer.appendChild(subtitle);
  exportContainer.appendChild(list);
  exportContainer.appendChild(footer);
  document.body.appendChild(exportContainer);

  try {
    const canvas = await html2canvas(exportContainer, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#f7f3e9',
      logging: false,
      width: 360,
      windowWidth: 360,
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `吉日清单_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  } catch (err) {
    console.error('导出图片失败:', err);
    alert('导出图片失败，请重试');
  } finally {
    document.body.removeChild(exportContainer);
  }
}
