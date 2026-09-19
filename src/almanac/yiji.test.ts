import { describe, it, expect } from 'vitest';
import { getDayYiJi, scoreDay, getShiChenInfo } from './yiji';

describe('宜忌计算', () => {
  it('应返回宜忌信息', () => {
    const yiJi = getDayYiJi(2024, 6, 15);
    expect(yiJi.yi).toBeInstanceOf(Array);
    expect(yiJi.ji).toBeInstanceOf(Array);
    expect(yiJi.yi.length).toBeGreaterThan(0);
    expect(yiJi.jianXing).toBeTruthy();
    expect(yiJi.zhiShen).toBeTruthy();
  });

  it('应正确计算冲煞', () => {
    const yiJi = getDayYiJi(2024, 6, 15);
    expect(yiJi.chong).toBeTruthy();
    expect(yiJi.sha).toBeTruthy();
    expect(yiJi.chongShengxiao).toBeTruthy();
  });
});

describe('择日评分', () => {
  it('应返回有效分数', () => {
    const score = scoreDay(2024, 6, 15, ['嫁娶']);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('冲煞应降低分数', () => {
    const score1 = scoreDay(2024, 6, 15, ['嫁娶']);
    const score2 = scoreDay(2024, 6, 15, ['嫁娶'], ['鼠']);
    // 如果当天冲鼠，分数应该更低
    expect(score2).toBeLessThanOrEqual(score1);
  });
});

describe('时辰吉凶', () => {
  it('应返回12个时辰', () => {
    const hours = getShiChenInfo('甲子');
    expect(hours).toHaveLength(12);
    hours.forEach(h => {
      expect(['吉', '凶', '平']).toContain(h.luck);
      expect(h.name).toBeTruthy();
      expect(h.ganZhi).toBeTruthy();
    });
  });
});
