// 作物农事模板与「节气不宜」规则
//
// 每个阶段有两种日期描述方式：
//   beforeHarvestDays —— 距计划收获日往前多少天（内建模板节点，由收获日反推）
//   minGap            —— 该节点与下一节点之间至少间隔多少天（太近的判定 + 调整下限）
// growthDays 是作物从播种到收获的经验生长天数，用于与反推出的实际跨度对照。
//
// 以下数值均为经验近似值，模板里全部可以在界面上增删改。

export type PhaseKey = 'sow' | 'thin' | 'topdress' | 'spray' | 'water-control' | 'custom' | 'harvest';

export const PHASE_LABELS: Record<PhaseKey, string> = {
  'sow': '播种',
  'thin': '间苗',
  'topdress': '追肥',
  'spray': '打药',
  'water-control': '控水',
  'custom': '其他农活',
  'harvest': '收获',
};

export interface StageTemplate {
  key: PhaseKey;
  label: string;
  beforeHarvestDays: number; // 距收获日的天数（收获节点为 0）
  minGap: number; // 与下一节点的最小间隔（天）
}

export interface CropDef {
  id: string;
  name: string;
  growthDays: number; // 经验生长期（播种→收获）
  note?: string;
  stages: StageTemplate[]; // 不含收获，收获节点由系统固定在计划收获日
}

// 节气不宜规则：命中「节气当日 ± radius 天」窗口时，把节点调开。
// 只依据农时常识，不涉及黄历宜忌。
export interface TermTaboo {
  terms: string[];
  reason: string;
  radius: number; // 窗口半径（天），节气当日为 0
}

export const TERM_TABOOS: Record<Exclude<PhaseKey, 'custom' | 'harvest'>, TermTaboo> = {
  'sow': {
    terms: ['霜降', '大寒'],
    radius: 1,
    reason: '播种要抢地温：霜降前后可能有霜冻伤嫩芽，大寒前后地冻开不了垄',
  },
  'thin': {
    terms: ['大暑'],
    radius: 1,
    reason: '大暑前后高温暴晒，间苗留下的幼苗易被晒伤、失水萎蔫',
  },
  'topdress': {
    terms: ['夏至', '小暑'],
    radius: 1,
    reason: '夏至、小暑前后多大到暴雨，追肥容易被雨水冲走、烧根，躲过降雨后再补更稳',
  },
  'spray': {
    terms: ['雨水', '白露'],
    radius: 1,
    reason: '雨水、白露前后多连阴雨或重露，喷药易被冲刷稀释，药效差还易药害',
  },
  'water-control': {
    terms: ['大暑', '小暑'],
    radius: 1,
    reason: '小暑大暑蒸发最旺，骤然控水容易旱蔫，应循序渐进而不是掐在这两天断水',
  },
};

const stages = (defs: Array<[PhaseKey, string, number, number]>): StageTemplate[] =>
  defs.map(([key, label, beforeHarvestDays, minGap]) => ({ key, label, beforeHarvestDays, minGap }));

export const CROPS: CropDef[] = [
  {
    id: 'spring-corn',
    name: '春玉米',
    growthDays: 120,
    note: '北方一熟春玉米，谷雨前后播、八月中下旬收',
    stages: stages([
      ['sow', '播种', 120, 25],
      ['thin', '间苗', 95, 25],
      ['topdress', '追肥', 60, 20],
      ['spray', '打药', 35, 20],
      ['water-control', '控水', 10, 10],
    ]),
  },
  {
    id: 'summer-corn',
    name: '夏玉米',
    growthDays: 100,
    note: '麦收后抢播的夏玉米',
    stages: stages([
      ['sow', '播种', 100, 20],
      ['thin', '间苗', 80, 20],
      ['topdress', '追肥', 50, 18],
      ['spray', '打药', 25, 15],
      ['water-control', '控水', 10, 10],
    ]),
  },
  {
    id: 'winter-wheat',
    name: '冬小麦',
    growthDays: 230,
    note: '白露—秋分播种，跨冬至后次年夏收',
    stages: stages([
      ['sow', '播种', 230, 210],
      ['topdress', '追肥', 70, 35],
      ['spray', '打药', 30, 20],
      ['water-control', '控水', 12, 12],
    ]),
  },
  {
    id: 'summer-soybean',
    name: '夏大豆',
    growthDays: 105,
    note: '麦收后播种，九月下旬收获',
    stages: stages([
      ['sow', '播种', 105, 20],
      ['thin', '间苗', 85, 20],
      ['topdress', '追肥', 50, 20],
      ['spray', '打药', 30, 18],
      ['water-control', '控水', 15, 15],
    ]),
  },
  {
    id: 'cotton',
    name: '棉花',
    growthDays: 150,
    note: '四月育苗移栽，九十月吐絮采收',
    stages: stages([
      ['sow', '播种', 150, 30],
      ['thin', '间苗', 120, 30],
      ['topdress', '追肥', 70, 30],
      ['spray', '打药', 40, 25],
      ['water-control', '控水', 15, 15],
    ]),
  },
  {
    id: 'single-rice',
    name: '单季稻',
    growthDays: 140,
    note: '中稻/一季稻，清明育秧、处暑后收',
    stages: stages([
      ['sow', '播种（育秧）', 140, 30],
      ['thin', '间苗（匀秧）', 115, 25],
      ['topdress', '追肥', 60, 30],
      ['spray', '打药', 35, 25],
      ['water-control', '控水（晒田）', 12, 12],
    ]),
  },
  {
    id: 'peanut',
    name: '花生',
    growthDays: 130,
    note: '春播花生，五月上种、九月收',
    stages: stages([
      ['sow', '播种', 130, 25],
      ['thin', '间苗', 105, 25],
      ['topdress', '追肥', 60, 25],
      ['spray', '打药', 30, 18],
      ['water-control', '控水', 20, 20],
    ]),
  },
  {
    id: 'tomato',
    name: '露地番茄',
    growthDays: 110,
    note: '晚霜后定植，夏秋采收',
    stages: stages([
      ['sow', '播种（育苗）', 110, 20],
      ['thin', '间苗', 90, 20],
      ['topdress', '追肥', 45, 20],
      ['spray', '打药', 25, 15],
      ['water-control', '控水', 10, 10],
    ]),
  },
];

export function getCrop(id: string): CropDef | undefined {
  return CROPS.find(c => c.id === id);
}

// 节点默认最小间隔（新增自定义节点时用）
export const DEFAULT_MIN_GAP = 3;
