// 农事择日规则：四离四绝日、播种节气窗口、极端高温打药提示
//
// 四离日：春分、秋分、夏至、冬至的前一天（节气交替、气将转，旧俗大事避让）
// 四绝日：立春、立夏、立秋、立冬的前一天（一季之气将绝）
// 农事安排上，播种/追肥/打药/控水/间苗这些「动土动苗」的活一律避开四离四绝，
// 采收为用户给定的目标日，不强制移动，只做提示。
import { gregorianToJDN } from '../utils/date';
import { getTermNameOnDate } from './solar-terms';
import { SOLAR_TERMS } from './constants';
import { Hardiness } from './crops';

const TERM_INDEX: Record<string, number> = Object.fromEntries(SOLAR_TERMS.map((n, i) => [n, i]));

// 「四立」「二分二至」节气名
const LI_TERMS = ['立春', '立夏', '立秋', '立冬'];
const FEN_ZHI_TERMS = ['春分', '秋分', '夏至', '冬至'];
export const SIJIE_TERMS = [...LI_TERMS, ...FEN_ZHI_TERMS];

export interface ForbiddenInfo {
  forbidden: boolean;
  kind?: 'sili' | 'sijue';
  reason?: string;
}

// 某日期是否为四离/四绝日
export function getForbiddenDay(year: number, month: number, day: number): ForbiddenInfo {
  // 看「次日」是否交节（四离四绝都是节气前一天）
  const nextJdn = gregorianToJDN(year, month, day) + 1;
  const jdnToYmd = (jdn: number): [number, number, number] => {
    const a = jdn + 32044;
    const b = Math.floor((4 * a + 3) / 146097);
    const c = a - Math.floor((146097 * b) / 4);
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor((1461 * d) / 4);
    const m0 = Math.floor((5 * e + 2) / 153);
    const dd = e - Math.floor((153 * m0 + 2) / 5) + 1;
    const mm = m0 + 3 - 12 * Math.floor(m0 / 10);
    const yy = 100 * b + d - 4800 + Math.floor(m0 / 10);
    return [yy, mm, dd];
  };
  const [ny, nm, nd] = jdnToYmd(nextJdn);
  const term = getTermNameOnDate(ny, nm, nd);
  if (!term) return { forbidden: false };

  if (FEN_ZHI_TERMS.includes(term)) {
    return { forbidden: true, kind: 'sili', reason: `四离日（次日交${term}，节气交替、气场转换，农事动土宜避让）` };
  }
  if (LI_TERMS.includes(term)) {
    return { forbidden: true, kind: 'sijue', reason: `四绝日（次日交${term}，一季之气将尽，下种动苗宜避让）` };
  }
  return { forbidden: false };
}

// 播种窗口：返回某作物适宜播种的节气区间起止节气名
export function getSowWindow(hardiness: Hardiness): { startTerm: string; endTerm: string; description: string } {
  if (hardiness === 'tender') {
    return {
      startTerm: '清明',
      endTerm: '霜降',
      description: '喜温怕霜：清明断霜后下种，霜降见霜前结束',
    };
  }
  return {
    startTerm: '霜降',
    endTerm: '清明',
    description: '耐寒越冬：霜降后播种，至次年清明前完成',
  };
}

// 判断某日（按所处节气区间）是否落在作物的播种窗口内
export function isInSowWindow(activeTerm: string, hardiness: Hardiness): boolean {
  const order = (name: string) => TERM_INDEX[name];
  if (hardiness === 'tender') {
    const t = order(activeTerm);
    return t >= order('清明') && t < order('霜降');
  }
  // hardy: 霜降..冬至..小寒..春分..清明（跨年环绕）
  const t = order(activeTerm);
  return t >= order('霜降') || t < order('清明');
}

// 极端高温（大暑）打药提醒：不调日子，只提示避开正午
export function getSprayHeatWarning(activeTerm: string): string | undefined {
  if (activeTerm === '大暑' || activeTerm === '小暑') {
    return '正值暑热，打药宜在早晚凉爽时段，避开正午高温（防药害与人员中暑）';
  }
  return undefined;
}
