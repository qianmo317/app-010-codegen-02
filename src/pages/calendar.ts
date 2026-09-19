import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { solarToLunar } from '../almanac/lunar';
import { getDayYiJi } from '../almanac/yiji';
import { WEEK_DAYS } from '../almanac/constants';
import { getWeekDay, daysInMonth } from '../utils/date';

export function renderCalendar(app: HTMLElement) {
  clearElement(app);
  app.className = 'page calendar-page';

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1;

  // 头部
  const header = createElement('div', 'calendar-header');
  const title = createElement('h1', 'page-title', '老黄历');
  const nav = createElement('div', 'month-nav');

  const prevBtn = createElement('button', 'nav-btn', '◀');
  const monthDisplay = createElement('span', 'month-display');
  const nextBtn = createElement('button', 'nav-btn', '▶');
  const todayBtn = createElement('button', 'nav-btn today-btn', '今');

  nav.append(prevBtn, monthDisplay, nextBtn, todayBtn);
  header.append(title, nav);

  // 快捷入口
  const quickNav = createElement('div', 'quick-nav');
  const pickLink = createElement('a', 'quick-link', '择日') as HTMLAnchorElement;
  pickLink.href = '/pick';
  pickLink.addEventListener('click', (e) => { e.preventDefault(); router.navigate('/pick'); });

  const farmLink = createElement('a', 'quick-link', '农事') as HTMLAnchorElement;
  farmLink.href = '/farm';
  farmLink.addEventListener('click', (e) => { e.preventDefault(); router.navigate('/farm'); });

  quickNav.append(pickLink, farmLink);
  header.appendChild(quickNav);

  // 星期标题
  const weekHeader = createElement('div', 'week-header');
  WEEK_DAYS.forEach(d => {
    weekHeader.appendChild(createElement('div', 'week-day', d));
  });

  // 日历网格
  const grid = createElement('div', 'calendar-grid');

  function renderMonth() {
    clearElement(grid);
    monthDisplay.textContent = `${currentYear}年${currentMonth}月`;

    const firstWeekDay = getWeekDay(currentYear, currentMonth, 1);
    const totalDays = daysInMonth(currentYear, currentMonth);

    // 空白占位
    for (let i = 0; i < firstWeekDay; i++) {
      grid.appendChild(createElement('div', 'day-cell empty'));
    }

    for (let day = 1; day <= totalDays; day++) {
      const cell = createElement('div', 'day-cell');
      const isToday = currentYear === now.getFullYear() && currentMonth === now.getMonth() + 1 && day === now.getDate();
      if (isToday) cell.classList.add('today');

      const solarDay = createElement('div', 'solar-day', String(day));
      const lunarInfo = solarToLunar(currentYear, currentMonth, day);
      const lunarText = lunarInfo.day === 1 ? lunarInfo.monthName : lunarInfo.dayName;
      const lunarDay = createElement('div', 'lunar-day', lunarText);

      // 节气标记
      if (lunarInfo.solarTerm) {
        cell.classList.add('solar-term');
        lunarDay.textContent = lunarInfo.solarTerm;
      }

      // 宜忌标记
      const yiJi = getDayYiJi(currentYear, currentMonth, day);
      if (yiJi.yi.length > 0) {
        cell.classList.add('has-yi');
      }

      cell.append(solarDay, lunarDay);
      cell.addEventListener('click', () => {
        router.navigate(`/day/${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      });

      grid.appendChild(cell);
    }
  }

  prevBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    renderMonth();
  });

  nextBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    renderMonth();
  });

  todayBtn.addEventListener('click', () => {
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
    renderMonth();
  });

  app.append(header, weekHeader, grid);
  renderMonth();
}
