import { describe, it, expect } from 'vitest';
import {
  getSolarTermDateList, getTermAtDate, getTermJDNByName, isInTermWindow, solarLongitude,
} from './solar-terms';
import { gregorianToJDN } from '../utils/date';

describe('二十四节气精确引擎', () => {
  const expected: Record<number, Record<string, [number, number]>> = {
    2024: {
      '小寒': [1, 6], '大寒': [1, 20], '立春': [2, 4], '雨水': [2, 19],
      '惊蛰': [3, 5], '春分': [3, 20], '清明': [4, 4], '谷雨': [4, 19],
      '立夏': [5, 5], '小满': [5, 20], '芒种': [6, 5], '夏至': [6, 21],
      '小暑': [7, 6], '大暑': [7, 22], '立秋': [8, 7], '处暑': [8, 22],
      '白露': [9, 7], '秋分': [9, 22], '寒露': [10, 8], '霜降': [10, 23],
      '立冬': [11, 7], '小雪': [11, 22], '大雪': [12, 6], '冬至': [12, 21],
    },
    2000: {
      '立春': [2, 4], '惊蛰': [3, 5], '春分': [3, 20], '清明': [4, 4],
      '夏至': [6, 21], '冬至': [12, 21],
    },
    2023: { '立春': [2, 4], '大寒': [1, 20], '冬至': [12, 22], '秋分': [9, 23] },
    2025: { '立春': [2, 3], '大寒': [1, 20], '冬至': [12, 21], '清明': [4, 4], '夏至': [6, 21], '小雪': [11, 22] },
    1980: { '立春': [2, 5], '冬至': [12, 22] },
  };

  Object.entries(expected).forEach(([yearStr, terms]) => {
    const year = Number(yearStr);
    const list = getSolarTermDateList(year);
    Object.entries(terms).forEach(([name, [m, d]]) => {
      it(`${year}年${name}为${m}月${d}日`, () => {
        const t = list.find(x => x.name === name)!;
        expect([t.month, t.day]).toEqual([m, d]);
      });
    });
  });

  it('getTermAtDate 与列表一致', () => {
    const t = getSolarTermDateList(2024).find(x => x.name === '立春')!;
    expect(getTermAtDate(2024, t.month, t.day)).toBe('立春');
    expect(getTermAtDate(2024, t.month, t.day + 1)).toBeUndefined();
  });

  it('节气窗口判定支持半径与跨年', () => {
    const jdn = getTermJDNByName(2024, '霜降')!;
    expect(isInTermWindow(jdn, '霜降', 2024, 1)).toBe(true);
    expect(isInTermWindow(jdn - 1, '霜降', 2024, 1)).toBe(true);
    expect(isInTermWindow(jdn - 3, '霜降', 2024, 1)).toBe(false);
    // 跨年：1月初的小寒用上一年也能判
    const xh = getTermJDNByName(2024, '小寒')!;
    expect(isInTermWindow(xh, '小寒', 2023, 1)).toBe(true);
  });

  it('1900-2100 全部节气单调、间隔 13-16 天、日期合法', () => {
    for (let year = 1900; year <= 2100; year += 3) {
      const list = getSolarTermDateList(year);
      expect(list).toHaveLength(24);
      let prev = list[0].jdn;
      for (let i = 1; i < list.length; i++) {
        const gap = list[i].jdn - prev;
        expect(gap).toBeGreaterThanOrEqual(13);
        expect(gap).toBeLessThanOrEqual(16);
        expect(list[i].day).toBeGreaterThanOrEqual(1);
        expect(list[i].day).toBeLessThanOrEqual(31);
        prev = list[i].jdn;
      }
    }
  });

  it('黄经级数自洽：交节时刻（牛顿迭代收敛点）目标黄经偏差 < 0.001°', () => {
    const list = getSolarTermDateList(2024);
    list.forEach((_, i) => {
      const target = (285 + i * 15) % 360;
      // 用与引擎相同的迭代把交节时刻精确求出来，再验证残差
      const month = Math.floor(i / 2) + 1;
      const rough = [6, 20, 4, 19, 6, 21, 5, 20, 6, 21, 6, 21, 7, 23, 8, 23, 8, 23, 8, 24, 8, 22, 7, 22];
      const dt = 69 / 86400;
      let jd = gregorianToJDN(2024, month, rough[i]) + 0.5 + dt;
      const wrap = (d: number) => ((d % 360) + 540) % 360 - 180;
      for (let k = 0; k < 8; k++) jd -= wrap(solarLongitude(jd) - target) / 0.9856473;
      expect(Math.abs(wrap(solarLongitude(jd) - target))).toBeLessThan(0.001);
    });
  });
});
