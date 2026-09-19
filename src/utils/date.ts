// 儒略日计算（简化版，适用于1900-2100年）
export function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function jdnToGregorian(jdn: number): [number, number, number] {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor(1461 * d / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return [year, month, day];
}

// 获取某年某月的天数
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// 获取星期几（0=周日）
export function getWeekDay(year: number, month: number, day: number): number {
  const jdn = gregorianToJDN(year, month, day);
  return (jdn + 1) % 7;
}

// 格式化日期
export function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 解析日期
export function parseDate(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

// 日期加减
export function addDays(year: number, month: number, day: number, days: number): [number, number, number] {
  const jdn = gregorianToJDN(year, month, day) + days;
  return jdnToGregorian(jdn);
}

// 两个日期之间的天数差
export function daysBetween(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  return gregorianToJDN(y2, m2, d2) - gregorianToJDN(y1, m1, d1);
}
