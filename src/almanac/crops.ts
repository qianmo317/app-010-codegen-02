// 作物农事节点模板
//
// 每个节点用「锚点 + 偏移」定义：
//   base: 'sow' 相对播种日，'harvest' 相对采收日
//   offsetDays: 距锚点的天数（sow 锚点为正=播后；harvest 锚点为负=收前）
// 排程器按作物生长天数（播种→采收）反推播种日，再依模板生成全部节点。

export type NodeType = 'sow' | 'thin' | 'topdress' | 'spray' | 'waterControl' | 'harvest' | 'other';

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  sow: '播种',
  thin: '间苗',
  topdress: '追肥',
  spray: '打药',
  waterControl: '控水',
  harvest: '采收',
  other: '其他',
};

// 耐寒类型：决定播种避哪些节气（霜期）
export type Hardiness = 'tender' | 'hardy';

export interface CropNodeTemplate {
  type: NodeType;
  label?: string; // 同一类型有多道活时区分，如「苗肥」「穗肥」
  base: 'sow' | 'harvest';
  offsetDays: number;
  note?: string;
}

export interface CropTemplate {
  key: string;
  name: string;
  hardiness: Hardiness;
  defaultGrowthDays: number; // 播种到采收的参考天数
  nodes: CropNodeTemplate[];
}

// 播种节气窗口（按节气区间）：
// tender 喜温作物忌霜：播种须落在清明（霜断）之后、霜降（见霜）之前
// hardy 耐寒作物：播种须落在霜降之后、次年清明之前（越冬/早春播）
export const SOW_WINDOW: Record<Hardiness, { after: string; before: string; reason: string }> = {
  tender: {
    after: '清明',
    before: '霜降',
    reason: '喜温作物怕霜，须断霜（清明后）下种、赶在见霜（霜降）前播完',
  },
  hardy: {
    after: '霜降',
    before: '清明',
    reason: '耐寒作物趁晚秋地温或早春（霜降后至次年清明前）下种',
  },
};

export const CROP_TEMPLATES: CropTemplate[] = [
  {
    key: 'spring-corn',
    name: '春玉米',
    hardiness: 'tender',
    defaultGrowthDays: 110,
    nodes: [
      { type: 'sow', base: 'harvest', offsetDays: -110, note: '地温稳定 10℃ 以上' },
      { type: 'thin', base: 'sow', offsetDays: 15, note: '3-4 叶期间苗' },
      { type: 'topdress', label: '苗肥', base: 'sow', offsetDays: 35 },
      { type: 'spray', label: '防钻心虫', base: 'sow', offsetDays: 55 },
      { type: 'topdress', label: '攻穗肥', base: 'harvest', offsetDays: -40, note: '大喇叭口期' },
      { type: 'waterControl', base: 'harvest', offsetDays: -10, note: '收前停水促熟' },
      { type: 'harvest', base: 'harvest', offsetDays: 0 },
    ],
  },
  {
    key: 'cotton',
    name: '棉花',
    hardiness: 'tender',
    defaultGrowthDays: 140,
    nodes: [
      { type: 'sow', base: 'harvest', offsetDays: -140, note: '播后覆膜保温' },
      { type: 'thin', base: 'sow', offsetDays: 20, note: '2 叶定苗' },
      { type: 'spray', label: '防苗蚜', base: 'sow', offsetDays: 30 },
      { type: 'topdress', label: '花铃肥', base: 'harvest', offsetDays: -55 },
      { type: 'spray', label: '防棉铃虫', base: 'harvest', offsetDays: -45 },
      { type: 'waterControl', base: 'harvest', offsetDays: -12, note: '吐絮期停水防烂铃' },
      { type: 'harvest', base: 'harvest', offsetDays: 0 },
    ],
  },
  {
    key: 'rice',
    name: '水稻（一季稻）',
    hardiness: 'tender',
    defaultGrowthDays: 130,
    nodes: [
      { type: 'sow', label: '育秧', base: 'harvest', offsetDays: -130 },
      { type: 'thin', label: '插秧', base: 'sow', offsetDays: 30, note: '秧龄 30 天移栽' },
      { type: 'topdress', label: '分蘖肥', base: 'sow', offsetDays: 40 },
      { type: 'spray', label: '防稻瘟', base: 'harvest', offsetDays: -55 },
      { type: 'topdress', label: '穗肥', base: 'harvest', offsetDays: -35 },
      { type: 'waterControl', label: '晒田', base: 'harvest', offsetDays: -45, note: '分蘖末期晒田控旺' },
      { type: 'waterControl', label: '收前排干', base: 'harvest', offsetDays: -7 },
      { type: 'harvest', base: 'harvest', offsetDays: 0 },
    ],
  },
  {
    key: 'winter-wheat',
    name: '冬小麦',
    hardiness: 'hardy',
    defaultGrowthDays: 250,
    nodes: [
      { type: 'sow', base: 'harvest', offsetDays: -250, note: '秋分前后播种' },
      { type: 'topdress', label: '分蘖肥', base: 'sow', offsetDays: 30 },
      { type: 'waterControl', label: '冬灌', base: 'sow', offsetDays: 50, note: '封冻前浇越冬水' },
      { type: 'topdress', label: '返青肥', base: 'sow', offsetDays: 140, note: '惊蛰前后' },
      { type: 'spray', label: '防蚜虫/锈病', base: 'sow', offsetDays: 190 },
      { type: 'topdress', label: '灌浆肥', base: 'harvest', offsetDays: -25 },
      { type: 'waterControl', base: 'harvest', offsetDays: -12, note: '收前停水' },
      { type: 'harvest', base: 'harvest', offsetDays: 0 },
    ],
  },
  {
    key: 'chinese-cabbage',
    name: '大白菜（秋）',
    hardiness: 'hardy',
    defaultGrowthDays: 80,
    nodes: [
      { type: 'sow', base: 'harvest', offsetDays: -80, note: '立秋前后直播' },
      { type: 'thin', base: 'sow', offsetDays: 12, note: '拉十字间苗' },
      { type: 'topdress', label: '团棵肥', base: 'sow', offsetDays: 30 },
      { type: 'spray', label: '防菜青虫', base: 'sow', offsetDays: 45 },
      { type: 'topdress', label: '包心肥', base: 'harvest', offsetDays: -25 },
      { type: 'waterControl', base: 'harvest', offsetDays: -7 },
      { type: 'harvest', base: 'harvest', offsetDays: 0, note: '小雪前收完' },
    ],
  },
  {
    key: 'spring-soybean',
    name: '春大豆',
    hardiness: 'tender',
    defaultGrowthDays: 100,
    nodes: [
      { type: 'sow', base: 'harvest', offsetDays: -100 },
      { type: 'thin', base: 'sow', offsetDays: 14 },
      { type: 'topdress', label: '花荚肥', base: 'sow', offsetDays: 50 },
      { type: 'spray', label: '防豆荚螟', base: 'harvest', offsetDays: -30 },
      { type: 'waterControl', base: 'harvest', offsetDays: -10 },
      { type: 'harvest', base: 'harvest', offsetDays: 0 },
    ],
  },
  {
    key: 'custom',
    name: '自定义作物',
    hardiness: 'tender',
    defaultGrowthDays: 90,
    nodes: [
      { type: 'sow', base: 'harvest', offsetDays: -90 },
      { type: 'thin', base: 'sow', offsetDays: 12 },
      { type: 'topdress', base: 'sow', offsetDays: 30 },
      { type: 'spray', base: 'sow', offsetDays: 45 },
      { type: 'waterControl', base: 'harvest', offsetDays: -10 },
      { type: 'harvest', base: 'harvest', offsetDays: 0 },
    ],
  },
];

export function getCropTemplate(key: string): CropTemplate {
  return CROP_TEMPLATES.find(c => c.key === key) ?? CROP_TEMPLATES[CROP_TEMPLATES.length - 1];
}
