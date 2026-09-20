// 二十四节气查询（查表实现，1900-2100，北京时间当日）
// 数据来源见 src/data/solar-terms-data.ts（寿星天文历离线生成）
import { SOLAR_TERMS } from './constants';
import { SOLAR_TERM_TABLE, SOLAR_TERM_START_YEAR, SOLAR_TERM_END_YEAR } from '../data/solar-terms-data';
import { gregorianToJDN, jdnToGregorian } from '../utils/date';

export interface TermDate {
  name: string;
  year: number;
  month: number;
  day: number;
  index: number;
}

export interface TermPeriod {
  name: string; // 本区间起点节气名（交节当天起）
  startJdn: number;
  endJdn: number; // 下一节气前一天
}

// 某年某节气公历日期。index: SOLAR_TERMS 下标（0=小寒）
export function getSolarTermDate(index: number, year: number): [number, number, number] {
  if (year < SOLAR_TERM_START_YEAR || year > SOLAR_TERM_END_YEAR) {
    throw new Error(`年份 ${year} 超出节气表范围 ${SOLAR_TERM_START_YEAR}-${SOLAR_TERM_END_YEAR}`);
  }
  const day = SOLAR_TERM_TABLE[year - SOLAR_TERM_START_YEAR][index];
  return [year, Math.floor(index / 2) + 1, day];
}

// 某年全部 24 个节气（按时间顺序：小寒..冬至）
export function getSolarTermDatesExact(year: number): TermDate[] {
  return SOLAR_TERMS.map((name, index) => {
    const [y, m, d] = getSolarTermDate(index, year);
    return { name, year: y, month: m, day: d, index };
  });
}

// 某公历日期当天恰好交节则返回节气名，否则 undefined
export function getTermNameOnDate(year: number, month: number, day: number): string | undefined {
  const jdn = gregorianToJDN(year, month, day);
  for (const y of [year - 1, year, year + 1]) {
    if (y < SOLAR_TERM_START_YEAR || y > SOLAR_TERM_END_YEAR) continue;
    for (let i = 0; i < 24; i++) {
      const [ty, tm, td] = getSolarTermDate(i, y);
      if (gregorianToJDN(ty, tm, td) === jdn) return SOLAR_TERMS[i];
    }
  }
  return undefined;
}

// 找到某年附近的全部节气交节点（儒略日，已排序）
function getTermPointsAround(year: number): Array<{ name: string; jdn: number }> {
  const points: Array<{ name: string; jdn: number }> = [];
  for (const y of [year - 1, year, year + 1]) {
    if (y < SOLAR_TERM_START_YEAR || y > SOLAR_TERM_END_YEAR) continue;
    for (let i = 0; i < 24; i++) {
      const [ty, tm, td] = getSolarTermDate(i, y);
      points.push({ name: SOLAR_TERMS[i], jdn: gregorianToJDN(ty, tm, td) });
    }
  }
  return points.sort((a, b) => a.jdn - b.jdn);
}

// 某公历日期所处的节气区间名（交节当天即算进入新节气）
export function getActiveTerm(year: number, month: number, day: number): string {
  const jdn = gregorianToJDN(year, month, day);
  const points = getTermPointsAround(year);
  let active = points[0]?.name ?? '小寒';
  for (const p of points) {
    if (p.jdn <= jdn) active = p.name;
    else break;
  }
  return active;
}

// 节气区间时间轴（用于批量比对/排程）
export function getTermPeriodsAround(year: number): TermPeriod[] {
  const points = getTermPointsAround(year);
  const periods: TermPeriod[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    periods.push({ name: points[i].name, startJdn: points[i].jdn, endJdn: points[i + 1].jdn - 1 });
  }
  return periods;
}

// 距离最近的指定节气交节日的天数（正=节气在该日期之后）。在前后两年内查找。
export function daysToTerm(year: number, month: number, day: number, termName: string): number {
  const jdn = gregorianToJDN(year, month, day);
  const idx = SOLAR_TERMS.indexOf(termName);
  if (idx < 0) return NaN;
  let best = NaN;
  for (const y of [year - 1, year, year + 1]) {
    if (y < SOLAR_TERM_START_YEAR || y > SOLAR_TERM_END_YEAR) continue;
    const [ty, tm, td] = getSolarTermDate(idx, y);
    const diff = gregorianToJDN(ty, tm, td) - jdn;
    if (Number.isNaN(best) || Math.abs(diff) < Math.abs(best)) best = diff;
  }
  return best;
}

// 查找某个节气区间（含交节当天）内某一“偏移天数”的日期
export function shiftJdn(jdn: number, days: number): [number, number, number] {
  return jdnToGregorian(jdn + days);
}
