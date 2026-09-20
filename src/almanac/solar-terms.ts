// 二十四节气精确计算
// 思路：用低精度太阳视黄经级数（Meeus《天文算法》），牛顿迭代求出太阳黄经
// 为 15° 整数倍的时刻（TT 力学时），再换算为北京时间日期（JDN）。
// 适用范围约 1900-2100，节气日期与紫金山天文台历表通常一致（交界日误差极少见）。

import { gregorianToJDN, jdnToGregorian } from '../utils/date';
import { SOLAR_TERMS } from './constants';

// 各节气在当月的粗略日期，仅作牛顿迭代初值（与真实值相差不超过 2 天即可）
const TERM_ROUGH_DAY = [6, 20, 4, 19, 6, 21, 5, 20, 6, 21, 6, 21, 7, 23, 8, 23, 8, 23, 8, 24, 8, 22, 7, 22];
const DEG = Math.PI / 180;

// 太阳视黄经（度），jdTT 为儒略日（力学时）。
// 采用 Meeus 低精度级数：平黄经 L0（式25.2）按儒略千年，M（式25.3）按儒略世纪。
export function solarLongitude(jdTT: number): number {
  const Tu = (jdTT - 2451545.0) / 365250; // 儒略千年
  const T = Tu * 10; // 儒略世纪
  const L0 =
    280.46646 +
    360007.6982779 * Tu +
    0.03032028 * Tu * Tu +
    (Tu * Tu * Tu) / 49931 -
    (Tu * Tu * Tu * Tu) / 15300 +
    (Tu * Tu * Tu * Tu * Tu) / 2000000;
  const M =
    (357.52911 + 35999.0502909 * T - 0.0001536 * T * T + (T * T * T) / 24490000) * DEG;
  const C =
    (1.914602 - 0.004817 * Tu - 0.000014 * Tu * Tu) * Math.sin(M) +
    (0.019993 - 0.000101 * Tu) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lon = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
  return ((lon % 360) + 360) % 360;
}

// ΔT（TT-UT，秒）近似值。只影响节气交节时刻在子夜前后的个别日期判定。
function deltaTSeconds(year: number): number {
  // 2000-2100 用 Espenak-Meeus 多项式
  if (year >= 2000) {
    const x = year - 2000;
    return 62.92 + 0.32217 * x + 0.005589 * x * x;
  }
  // 1900-2000 用实测锚点线性插值
  const anchors: Array<[number, number]> = [
    [1900, -2.8], [1910, 10.5], [1920, 21.2], [1930, 24.0], [1940, 24.4],
    [1950, 29.1], [1960, 33.2], [1970, 40.2], [1980, 50.5], [1990, 56.9],
    [2000, 63.8],
  ];
  if (year <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (year <= anchors[i][0]) {
      const [y0, v0] = anchors[i - 1];
      const [y1, v1] = anchors[i];
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return 63.8;
}

function wrap180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// 节气 i 对应太阳黄经：冬至 270°，小寒 285°，依次类推（与 SOLAR_TERMS 顺序一致）
function targetLongitude(i: number): number {
  return (285 + i * 15) % 360;
}

// 求某年第 i 个节气交节当日的 JDN（北京时间日期）
export function getTermJDN(year: number, i: number): number {
  const month = Math.floor(i / 2) + 1;
  const seedJDN = gregorianToJDN(year, month, TERM_ROUGH_DAY[i]);
  const dt = deltaTSeconds(year) / 86400;
  // 初值取世界时正午，转为力学时
  let jd = seedJDN + 0.5 + dt;
  const target = targetLongitude(i);
  for (let k = 0; k < 8; k++) {
    const diff = wrap180(solarLongitude(jd) - target);
    jd -= diff / 0.9856473; // 太阳每日约移 0.9856°
  }
  // JDN(北京日期) = floor(JD_UT + 0.5 + 8/24)，JD_UT = JD_TT - ΔT
  return Math.floor(jd - dt + 0.5 + 8 / 24);
}

// 某年 24 节气的 [月, 日]，顺序同 SOLAR_TERMS（小寒起、冬至止）
export function getSolarTermDateList(year: number): Array<{ name: string; month: number; day: number; jdn: number }> {
  return SOLAR_TERMS.map((name, i) => {
    const jdn = getTermJDN(year, i);
    const [, month, day] = jdnToGregorian(jdn);
    return { name, month, day, jdn };
  });
}

// 兼容旧接口：返回 24 个节气在各自月份中的「日」
export function getSolarTermDayList(year: number): number[] {
  return getSolarTermDateList(year).map(t => t.day);
}

const termCache = new Map<number, Map<string, number>>();

// 某年某节气名的 JDN（带缓存）
export function getTermJDNByName(year: number, termName: string): number | undefined {
  let map = termCache.get(year);
  if (!map) {
    map = new Map();
    getSolarTermDateList(year).forEach(t => map!.set(t.name, t.jdn));
    termCache.set(year, map);
  }
  return map.get(termName);
}

// 某日交什么节气（无则 undefined）
export function getTermAtDate(year: number, month: number, day: number): string | undefined {
  const jdn = gregorianToJDN(year, month, day);
  for (const t of getSolarTermDateList(year)) {
    if (t.jdn === jdn) return t.name;
  }
  return undefined;
}

// 判断某个 JDN 是否落在某节气「当日及前后各 radius 天」窗口内
export function isInTermWindow(jdn: number, termName: string, year: number, radius: number): boolean {
  for (const y of [year - 1, year, year + 1]) {
    const termJDN = getTermJDNByName(y, termName);
    if (termJDN !== undefined && Math.abs(jdn - termJDN) <= radius) return true;
  }
  return false;
}

export function jdnToISO(jdn: number): string {
  const [y, m, d] = jdnToGregorian(jdn);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
