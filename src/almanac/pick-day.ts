import { scoreDay, getDayYiJi } from './yiji';
import { solarToLunar } from './lunar';
import { gregorianToJDN, jdnToGregorian } from '../utils/date';

export interface PickResult {
  year: number;
  month: number;
  day: number;
  score: number;
  yi: string[];
  ji: string[];
  ganZhi: string;
  chong: string;
  reason: string;
}

export function pickDays(
  startYear: number, startMonth: number, startDay: number,
  endYear: number, endMonth: number, endDay: number,
  events: string[],
  avoidShengxiao: string[] = []
): PickResult[] {
  const startJdn = gregorianToJDN(startYear, startMonth, startDay);
  const endJdn = gregorianToJDN(endYear, endMonth, endDay);
  const results: PickResult[] = [];

  for (let jdn = startJdn; jdn <= endJdn; jdn++) {
    const [year, month, day] = jdnToGregorian(jdn);
    const score = scoreDay(year, month, day, events, avoidShengxiao);
    const yiJi = getDayYiJi(year, month, day);
    const lunar = solarToLunar(year, month, day);

    // 生成推荐理由
    const reasons: string[] = [];
    if (score >= 80) reasons.push('大吉之日');
    else if (score >= 60) reasons.push('吉日');

    for (const event of events) {
      if (yiJi.yi.some(y => event.includes(y) || y.includes(event))) {
        reasons.push(`宜${event}`);
      }
    }

    if (avoidShengxiao.length > 0 && avoidShengxiao.includes(yiJi.chongShengxiao)) {
      reasons.push(`冲${yiJi.chongShengxiao}，已排除`);
    }

    results.push({
      year, month, day,
      score,
      yi: yiJi.yi,
      ji: yiJi.ji,
      ganZhi: lunar.dayGanZhi,
      chong: yiJi.chong,
      reason: reasons.join('；') || '平日常日'
    });
  }

  // 按分数排序
  return results.sort((a, b) => b.score - a.score);
}

// 择日结果分类
export function categorizeResults(results: PickResult[]): {
  best: PickResult[];
  good: PickResult[];
  normal: PickResult[];
  bad: PickResult[];
} {
  return {
    best: results.filter(r => r.score >= 80),
    good: results.filter(r => r.score >= 60 && r.score < 80),
    normal: results.filter(r => r.score >= 40 && r.score < 60),
    bad: results.filter(r => r.score < 40)
  };
}
