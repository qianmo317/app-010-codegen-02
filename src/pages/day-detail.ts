import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { getDayInfo } from '../almanac/lunar';
import { getDayYiJi, getShiChenInfo } from '../almanac/yiji';
import { getFarmTipByDate } from '../almanac/farm';
import { WEEK_DAYS, PENG_ZU_TIAN, PENG_ZU_DI, XIU } from '../almanac/constants';
import { gregorianToJDN } from '../utils/date';

export function renderDayDetail(app: HTMLElement, dateStr: string) {
  clearElement(app);
  app.className = 'page day-detail-page';

  const [year, month, day] = dateStr.split('-').map(Number);
  const info = getDayInfo(year, month, day);
  const yiJi = getDayYiJi(year, month, day);
  const lunar = info.lunar;
  const jdn = gregorianToJDN(year, month, day);

  // 头部
  const header = createElement('div', 'detail-header');
  const backBtn = createElement('button', 'back-btn', '◀ 返回');
  backBtn.addEventListener('click', () => router.navigate('/'));
  const dateTitle = createElement('h2', 'date-title', `${year}年${month}月${day}日`);
  const weekText = createElement('div', 'week-text', `星期${WEEK_DAYS[info.weekDay]}`);
  header.append(backBtn, dateTitle, weekText);

  // 农历信息卡片
  const lunarCard = createElement('div', 'card lunar-card');
  lunarCard.innerHTML = `
    <div class="lunar-main">
      <div class="lunar-date">${lunar.monthName}${lunar.dayName}</div>
      <div class="ganzhi">
        <span>${lunar.yearGanZhi}年</span>
        <span>${lunar.monthGanZhi}月</span>
        <span>${lunar.dayGanZhi}日</span>
      </div>
      <div class="shengxiao">生肖：${lunar.shengxiao}</div>
      ${lunar.solarTerm ? `<div class="solar-term-badge">${lunar.solarTerm}</div>` : ''}
    </div>
  `;

  // 宜忌卡片
  const yijiCard = createElement('div', 'card yiji-card');
  const yiList = yiJi.yi.slice(0, 8).map(y => `<span class="yi-tag">${y}</span>`).join('');
  const jiList = yiJi.ji.slice(0, 8).map(j => `<span class="ji-tag">${j}</span>`).join('');
  yijiCard.innerHTML = `
    <h3>今日宜忌</h3>
    <div class="yiji-row">
      <div class="yiji-col yi">
        <div class="yiji-label">宜</div>
        <div class="yiji-tags">${yiList || '<span class="empty-tag">无</span>'}</div>
      </div>
      <div class="yiji-col ji">
        <div class="yiji-label">忌</div>
        <div class="yiji-tags">${jiList || '<span class="empty-tag">无</span>'}</div>
      </div>
    </div>
    <div class="yiji-meta">
      <span>建星：${yiJi.jianXing}</span>
      <span>值神：${yiJi.zhiShen}</span>
      <span>冲${yiJi.chong}煞${yiJi.sha}</span>
    </div>
  `;

  // 彭祖百忌
  const pengzuCard = createElement('div', 'card pengzu-card');
  const ganIndex = '甲乙丙丁戊己庚辛壬癸'.indexOf(lunar.dayGanZhi[0]);
  const zhiIndex = '子丑寅卯辰巳午未申酉戌亥'.indexOf(lunar.dayGanZhi[1]);
  pengzuCard.innerHTML = `
    <h3>彭祖百忌</h3>
    <div class="pengzu-item">${PENG_ZU_TIAN[ganIndex] || ''}</div>
    <div class="pengzu-item">${PENG_ZU_DI[zhiIndex] || ''}</div>
  `;

  // 时辰吉凶
  const hourCard = createElement('div', 'card hour-card');
  const shiChen = getShiChenInfo(lunar.dayGanZhi);
  const hourTable = createElement('div', 'hour-table');
  shiChen.forEach(h => {
    const row = createElement('div', `hour-row ${h.luck}`);
    row.innerHTML = `
      <span class="hour-name">${h.name}</span>
      <span class="hour-range">${h.range}</span>
      <span class="hour-ganzhi">${h.ganZhi}</span>
      <span class="hour-luck">${h.luck}</span>
    `;
    hourTable.appendChild(row);
  });
  hourCard.innerHTML = '<h3>时辰吉凶</h3>';
  hourCard.appendChild(hourTable);

  // 农事提示
  const farmCard = createElement('div', 'card farm-card');
  const farmTip = getFarmTipByDate(year, month, day, lunar.solarTerm);
  if (farmTip) {
    farmCard.innerHTML = `
      <h3>农事提示 · ${farmTip.term}</h3>
      <div class="farm-hou">${farmTip.hou}</div>
      <div class="farm-tasks">
        ${farmTip.tasks.map(t => `<span class="task-tag">${t}</span>`).join('')}
      </div>
    `;
  } else {
    farmCard.innerHTML = '<h3>农事提示</h3><div class="farm-empty">本月暂无特定农事提示</div>';
  }

  // 二十八宿
  const xiuCard = createElement('div', 'card xiu-card');
  const xiuIndex = (jdn + 1) % 28;
  xiuCard.innerHTML = `
    <h3>二十八宿</h3>
    <div class="xiu-name">${XIU[xiuIndex]}宿</div>
  `;

  app.append(header, lunarCard, yijiCard, pengzuCard, hourCard, farmCard, xiuCard);
}
