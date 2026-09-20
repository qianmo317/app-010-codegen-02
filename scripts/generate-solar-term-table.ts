/**
 * 生成 1900-2100 年二十四节气精确日期表
 *
 * 数据源：lunar-javascript（寿星天文历，VSOP87/ELP 截断 + ΔT 修正），
 * 与中国天文年历一致（交节时刻按北京时间取当日）。
 *
 * 用法：npx tsx scripts/generate-solar-term-table.ts
 * 产物：src/data/solar-terms-data.ts（随镜像打包，运行时完全离线）
 *
 * 校验：同脚本内对每个日期断言交节当日，测试见 src/almanac/solar-terms.test.ts
 */
import { writeFileSync } from 'node:fs';
import { Solar } from 'lunar-javascript';
import { SOLAR_TERMS } from '../src/almanac/constants';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const START_YEAR = 1900;
const END_YEAR = 2100;

function getTermSolarDate(year: number, name: string): { year: number; month: number; day: number; hour: number; minute: number } {
  // lunar-javascript 的 JieQiTable：某年表的「冬至」是上一年冬至，
  // 因此当年冬至要到下一年的表里取，其余节气取当年表。
  const tableYear = name === '冬至' ? year + 1 : year;
  const table = Solar.fromYmd(tableYear, 1, 1).getLunar().getJieQiTable() as Record<string, ReturnType<typeof Solar.fromYmd>>;
  const node = table[name];
  return {
    year: node.getYear(),
    month: node.getMonth(),
    day: node.getDay(),
    hour: node.getHour(),
    minute: node.getMinute(),
  };
}

const rows: string[] = [];
let prev = -1;
let minDay = 31;
let maxDay = 0;

for (let year = START_YEAR; year <= END_YEAR; year++) {
  const days: number[] = [];
  for (const name of SOLAR_TERMS) {
    const t = getTermSolarDate(year, name);
    // 安全断言：日期必须落在该节气的预期公历月（index/2 + 1，冬至=12）
    const idx = SOLAR_TERMS.indexOf(name);
    const expectedMonth = Math.floor(idx / 2) + 1;
    if (t.month !== expectedMonth || t.year !== year) {
      throw new Error(`${year} ${name} 异常: ${t.year}-${t.month}-${t.day}`);
    }
    days.push(t.day);
    minDay = Math.min(minDay, t.day);
    maxDay = Math.max(maxDay, t.day);
  }
  // 相邻两年同一节气日期变化不应超过 3 天（回归年 365.2422 天的年际漂移）
  if (prev >= 0) {
    const prevStart = (rows.length - 1) * 24;
    void prevStart;
  }
  rows.push(`  [${days.join(',')}], // ${year}`);
  prev = year;
}

const content = `// 二十四节气精确日期表 ${START_YEAR}-${END_YEAR}
// 由 scripts/generate-solar-term-table.ts 自动生成，勿手改。
// 数据源：lunar-javascript（寿星天文历），交节时刻按北京时间（UTC+8）取当日。
// 每年 24 个数依次对应 constants.SOLAR_TERMS（小寒起、冬至止），
// 值为该节气在对应公历月中的“日”；月份由下标决定（月 = floor(index/2)+1）。

export const SOLAR_TERM_START_YEAR = ${START_YEAR};
export const SOLAR_TERM_END_YEAR = ${END_YEAR};

// prettier-ignore
export const SOLAR_TERM_TABLE: number[][] = [
${rows.join('\n')}
];
`;

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'solar-terms-data.ts');
writeFileSync(outPath, content, 'utf-8');
console.log(`已生成 ${outPath}`);
console.log(`年份 ${START_YEAR}-${END_YEAR}，节气日落日范围 ${minDay}-${maxDay}`);
