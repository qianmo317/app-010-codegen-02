import { describe, it, expect } from 'vitest';
import { pickDays, categorizeResults } from './pick-day';

describe('择日算法', () => {
  it('应在规定时间内完成3年区间计算', () => {
    const start = performance.now();
    const results = pickDays(2024, 1, 1, 2026, 12, 31, ['嫁娶', '搬家']);
    const end = performance.now();

    expect(results.length).toBeGreaterThan(0);
    expect(end - start).toBeLessThan(300); // < 300ms
  });

  it('应按分数排序', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶']);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('应正确分类结果', () => {
    const results = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶']);
    const { best, good, normal, bad } = categorizeResults(results);
    expect(best.length + good.length + normal.length + bad.length).toBe(results.length);
  });

  it('应处理避讳生肖', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶'], ['鼠', '马']);
    expect(results.length).toBe(31);
  });
});
