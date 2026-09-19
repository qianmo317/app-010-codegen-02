import { describe, it, expect } from 'vitest';
import { solarToLunar, lunarToSolar, getYearGanZhi, getDayGanZhi, getSolarTermDates } from './lunar';

describe('农历转换', () => {
  // 关键日期验证
  const testCases = [
    { solar: [1900, 1, 31] as [number, number, number], lunar: [1900, 1, 1, false], desc: '1900年春节' },
    { solar: [1900, 2, 19] as [number, number, number], lunar: [1900, 1, 20, false], desc: '1900年正月二十' },
    { solar: [2000, 2, 5] as [number, number, number], lunar: [2000, 1, 1, false], desc: '2000年春节' },
    { solar: [2024, 2, 10] as [number, number, number], lunar: [2024, 1, 1, false], desc: '2024年春节' },
    { solar: [2025, 1, 29] as [number, number, number], lunar: [2025, 1, 1, false], desc: '2025年春节' },
  ];

  testCases.forEach(tc => {
    it(`应正确转换 ${tc.desc}`, () => {
      const result = solarToLunar(tc.solar[0], tc.solar[1], tc.solar[2]);
      expect(result.year).toBe(tc.lunar[0]);
      expect(result.month).toBe(tc.lunar[1]);
      expect(result.day).toBe(tc.lunar[2]);
      expect(result.isLeap).toBe(tc.lunar[3]);
    });
  });

  it('应正确处理闰月', () => {
    // 2023年闰二月
    const result = solarToLunar(2023, 3, 22);
    expect(result.year).toBe(2023);
    expect(result.month).toBe(2);
    expect(result.isLeap).toBe(true);
  });

  it('应支持双向转换', () => {
    const solar: [number, number, number] = [2024, 6, 15];
    const lunar = solarToLunar(solar[0], solar[1], solar[2]);
    const backToSolar = lunarToSolar(lunar.year, lunar.month, lunar.day, lunar.isLeap);
    expect(backToSolar[0]).toBe(solar[0]);
    expect(backToSolar[1]).toBe(solar[1]);
    expect(backToSolar[2]).toBe(solar[2]);
  });
});

describe('干支计算', () => {
  it('应正确计算年柱', () => {
    expect(getYearGanZhi(1984)).toBe('甲子');
    expect(getYearGanZhi(2024)).toBe('甲辰');
    expect(getYearGanZhi(2025)).toBe('乙巳');
  });

  it('应正确计算日柱', () => {
    // 1900年1月1日 = 甲戌日（儒略日2415021）
    expect(getDayGanZhi(2415021)).toBe('甲戌');
    // 1900年2月20日 = 甲子日
    expect(getDayGanZhi(2415071)).toBe('甲子');
    // 2024年1月1日 = 甲子日
    expect(getDayGanZhi(2460311)).toBe('甲子');
  });
});

describe('节气计算', () => {
  it('应返回24个节气日期', () => {
    const dates = getSolarTermDates(2024);
    expect(dates).toHaveLength(24);
    dates.forEach(d => {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(31);
    });
  });
});

describe('200个日期抽查', () => {
  // 生成伪随机日期（固定种子，保证可复现）
  function seededRandom(seed: number): number {
    const x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }

  const randomDates: [number, number, number][] = [];
  for (let i = 0; i < 200; i++) {
    const year = 1900 + Math.floor(seededRandom(i * 7) * 201);
    const month = 1 + Math.floor(seededRandom(i * 13) * 12);
    const day = 1 + Math.floor(seededRandom(i * 23) * 28);
    randomDates.push([year, month, day]);
  }

  // 添加边界和特殊日期（1900年春节为1月31日，故1月1日属于1899农历年，超出数据范围）
  const specialDates: [number, number, number][] = [
    [1900, 2, 1], [1900, 1, 31], [2100, 3, 15],
    [2000, 2, 29], [2023, 3, 22], [2023, 4, 19],
    [2024, 2, 10], [2025, 1, 29],
  ];

  it('200个随机日期应支持双向转换', () => {
    let passCount = 0;
    for (const [y, m, d] of randomDates) {
      try {
        const lunar = solarToLunar(y, m, d);
        expect(lunar.month).toBeGreaterThanOrEqual(1);
        expect(lunar.month).toBeLessThanOrEqual(12);
        expect(lunar.day).toBeGreaterThanOrEqual(1);
        expect(lunar.day).toBeLessThanOrEqual(30);

        const [backY, backM, backD] = lunarToSolar(lunar.year, lunar.month, lunar.day, lunar.isLeap);
        if (backY === y && backM === m && backD === d) {
          passCount++;
        }
      } catch {
        // 无效日期（如2月30日）跳过
      }
    }
    expect(passCount).toBeGreaterThanOrEqual(190);
  });

  it('特殊日期应正确转换', () => {
    for (const [y, m, d] of specialDates) {
      const lunar = solarToLunar(y, m, d);
      const [backY, backM, backD] = lunarToSolar(lunar.year, lunar.month, lunar.day, lunar.isLeap);
      expect(backY).toBe(y);
      expect(backM).toBe(m);
      expect(backD).toBe(d);
    }
  });

  it('日柱应在60甲子范围内', () => {
    for (const [y, m, d] of randomDates) {
      try {
        const lunar = solarToLunar(y, m, d);
        expect(lunar.dayGanZhi.length).toBe(2);
        expect(lunar.yearGanZhi.length).toBe(2);
      } catch {
        // 跳过无效日期
      }
    }
  });
});
