import { LUNAR_YEAR_DATA } from '../data/lunar-data';
import { TIAN_GAN, DI_ZHI, SHENG_XIAO, LUNAR_MONTH_NAMES, LUNAR_DAY_NAMES } from './constants';
import { gregorianToJDN, jdnToGregorian, getWeekDay, isLeapYear } from '../utils/date';
import { getSolarTermDateList, getTermAtDate } from './solar-terms';

export interface LunarInfo {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  shengxiao: string;
  monthName: string;
  dayName: string;
  solarTerm?: string;
}

// 获取某年的春节公历日期
function getSpringFestival(year: number): [number, number, number] {
  const data = LUNAR_YEAR_DATA[year - 1900];
  const offset = data.sf;
  let month = 1;
  let day = offset + 1;
  while (day > (month === 2 && isLeapYear(year) ? 29 : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])) {
    day -= (month === 2 && isLeapYear(year) ? 29 : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]);
    month++;
  }
  return [year, month, day];
}

// 公历转农历
export function solarToLunar(year: number, month: number, day: number): LunarInfo {
  if (year < 1900 || year > 2100) {
    throw new Error('Year out of range');
  }

  const jdn = gregorianToJDN(year, month, day);
  const sf = getSpringFestival(year);
  const sfJdn = gregorianToJDN(sf[0], sf[1], sf[2]);

  let lunarYear: number;
  let daysFromSF: number;

  if (jdn >= sfJdn) {
    lunarYear = year;
    daysFromSF = jdn - sfJdn;
  } else {
    lunarYear = year - 1;
    const prevSF = getSpringFestival(lunarYear);
    const prevSFJdn = gregorianToJDN(prevSF[0], prevSF[1], prevSF[2]);
    daysFromSF = jdn - prevSFJdn;
  }

  const data = LUNAR_YEAR_DATA[lunarYear - 1900];
  let lunarMonth = 1;
  let lunarDay = daysFromSF;
  let isLeap = false;

  for (let i = 0; i < 12; i++) {
    const monthDays = data.md[i];
    if (lunarDay < monthDays) {
      lunarMonth = i + 1;
      lunarDay = lunarDay + 1;
      break;
    }
    lunarDay -= monthDays;

    // 检查闰月
    if (data.lm === i + 1) {
      if (lunarDay < data.ld) {
        lunarMonth = i + 1;
        isLeap = true;
        lunarDay = lunarDay + 1;
        break;
      }
      lunarDay -= data.ld;
    }

    if (i === 11) {
      lunarMonth = 12;
      lunarDay = lunarDay + 1;
    }
  }

  // 计算干支
  const yearGanZhi = getYearGanZhi(lunarYear);
  const monthGanZhi = getMonthGanZhi(lunarYear, lunarMonth, isLeap, month, day);
  const dayGanZhi = getDayGanZhi(jdn);
  const shengxiao = SHENG_XIAO[(lunarYear - 4) % 12];

  // 获取节气
  const solarTerm = getSolarTerm(year, month, day);

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    yearGanZhi,
    monthGanZhi,
    dayGanZhi,
    shengxiao,
    monthName: (isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[lunarMonth - 1] + '月',
    dayName: LUNAR_DAY_NAMES[lunarDay - 1],
    solarTerm
  };
}

// 农历转公历
export function lunarToSolar(lunarYear: number, lunarMonth: number, lunarDay: number, isLeap: boolean = false): [number, number, number] {
  if (lunarYear < 1900 || lunarYear > 2100) {
    throw new Error('Year out of range');
  }

  const data = LUNAR_YEAR_DATA[lunarYear - 1900];
  const sf = getSpringFestival(lunarYear);
  const sfJdn = gregorianToJDN(sf[0], sf[1], sf[2]);

  let days = 0;
  for (let i = 0; i < lunarMonth - 1; i++) {
    days += data.md[i];
    if (data.lm === i + 1) days += data.ld;
  }

  if (isLeap && data.lm === lunarMonth) {
    days += data.md[lunarMonth - 1];
  }

  days += lunarDay - 1;

  const jdn = sfJdn + days;
  return jdnToGregorian(jdn);
}

// 年柱（以立春换年）
export function getYearGanZhi(year: number): string {
  // 简化处理：以农历年计算
  const gan = (year - 4) % 10;
  const zhi = (year - 4) % 12;
  return TIAN_GAN[gan] + DI_ZHI[zhi];
}

// 月柱（以节气换月）
export function getMonthGanZhi(year: number, lunarMonth: number, isLeap: boolean, _solarMonth: number, _solarDay: number): string {
  // 年干决定月干起始
  const yearGan = (year - 4) % 10;
  const monthGanStart = (yearGan % 5) * 2;

  // 根据节气调整月份
  let actualMonth = lunarMonth;
  if (isLeap) actualMonth = lunarMonth; // 闰月与前月同干支

  const gan = (monthGanStart + actualMonth - 1) % 10;
  const zhi = (actualMonth + 1) % 12; // 正月=寅
  return TIAN_GAN[gan] + DI_ZHI[zhi];
}

// 日柱（用儒略日推算）
export function getDayGanZhi(jdn: number): string {
  const offset = (jdn + 49) % 60;
  return TIAN_GAN[offset % 10] + DI_ZHI[offset % 12];
}

// 时柱
export function getHourGanZhi(dayGanZhi: string, hour: number): string {
  const dayGanIndex = TIAN_GAN.indexOf(dayGanZhi[0]);
  const hourZhiIndex = Math.floor((hour + 1) % 24 / 2) % 12;
  const hourGanStart = (dayGanIndex % 5) * 2;
  const hourGanIndex = (hourGanStart + hourZhiIndex) % 10;
  return TIAN_GAN[hourGanIndex] + DI_ZHI[hourZhiIndex];
}

// 节气计算（精确版，太阳视黄经牛顿迭代，详见 solar-terms.ts）
export function getSolarTerm(year: number, month: number, day: number): string | undefined {
  return getTermAtDate(year, month, day);
}

// 获取某年所有节气的日期（返回各节气在当月的「日」，顺序同 SOLAR_TERMS）
export function getSolarTermDates(year: number): number[] {
  return getSolarTermDateList(year).map(t => t.day);
}

// 获取某月所有节气信息
export function getMonthSolarTerms(year: number, month: number): Array<{ name: string; day: number }> {
  return getSolarTermDateList(year)
    .filter(t => t.month === month)
    .map(t => ({ name: t.name, day: t.day }));
}

// 获取日期信息（完整）
export function getDayInfo(year: number, month: number, day: number) {
  const lunar = solarToLunar(year, month, day);
  const jdn = gregorianToJDN(year, month, day);
  const weekDay = getWeekDay(year, month, day);

  return {
    solar: { year, month, day },
    lunar,
    weekDay,
    jdn
  };
}
