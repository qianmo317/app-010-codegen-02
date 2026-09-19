import { SOLAR_TERMS } from './constants';

// 农事提示数据
export interface FarmTip {
  term: string;
  hou: string; // 候应
  tasks: string[]; // 农事任务
}

const FARM_DATA: Record<string, FarmTip> = {
  '立春': {
    term: '立春',
    hou: '东风解冻，蛰虫始振，鱼上冰',
    tasks: ['准备春耕', '检修农具', '积肥造肥', '温室育苗']
  },
  '雨水': {
    term: '雨水',
    hou: '獭祭鱼，鸿雁来，草木萌动',
    tasks: ['麦田追肥', '油菜田间管理', '果树修剪', '防洪排涝准备']
  },
  '惊蛰': {
    term: '惊蛰',
    hou: '桃始华，仓庚鸣，鹰化为鸠',
    tasks: ['春耕大忙', '播种春玉米', '防治地下害虫', '茶树追肥']
  },
  '春分': {
    term: '春分',
    hou: '玄鸟至，雷乃发声，始电',
    tasks: ['水稻育秧', '播种棉花', '小麦灌溉', '蔬菜定植']
  },
  '清明': {
    term: '清明',
    hou: '桐始华，田鼠化为鴽，虹始见',
    tasks: ['播种高粱', '移栽红薯', '采制春茶', '防治蚜虫']
  },
  '谷雨': {
    term: '谷雨',
    hou: '萍始生，鸣鸠拂其羽，戴胜降于桑',
    tasks: ['播种谷子', '插秧', '棉花定苗', '防治棉蚜']
  },
  '立夏': {
    term: '立夏',
    hou: '蝼蝈鸣，蚯蚓出，王瓜生',
    tasks: ['夏收准备', '中稻移栽', '玉米间苗', '果树疏果']
  },
  '小满': {
    term: '小满',
    hou: '苦菜秀，靡草死，麦秋至',
    tasks: ['小麦收割', '油菜收获', '水稻耘田', '防治稻瘟病']
  },
  '芒种': {
    term: '芒种',
    hou: '螳螂生，鵙始鸣，反舌无声',
    tasks: ['抢收小麦', '播种晚稻', '棉花整枝', '防治棉铃虫']
  },
  '夏至': {
    term: '夏至',
    hou: '鹿角解，蝉始鸣，半夏生',
    tasks: ['夏播秋作物', '玉米追肥', '茶园遮阴', '防暑降温']
  },
  '小暑': {
    term: '小暑',
    hou: '温风至，蟋蟀居壁，鹰始挚',
    tasks: ['中稻追肥', '棉花打顶', '果树追肥', '防汛抗旱']
  },
  '大暑': {
    term: '大暑',
    hou: '腐草为萤，土润溽暑，大雨时行',
    tasks: ['双抢大忙', '晚稻插秧', '高粱收获', '防治稻飞虱']
  },
  '立秋': {
    term: '立秋',
    hou: '凉风至，白露生，寒蝉鸣',
    tasks: ['秋收准备', '棉花整枝', '果树嫁接', '播种秋菜']
  },
  '处暑': {
    term: '处暑',
    hou: '鹰乃祭鸟，天地始肃，禾乃登',
    tasks: ['中稻收获', '玉米收获', '棉花采收', '秋播准备']
  },
  '白露': {
    term: '白露',
    hou: '鸿雁来，玄鸟归，群鸟养羞',
    tasks: ['晚稻抽穗', '棉花采摘', '播种小麦', '防治稻瘟病']
  },
  '秋分': {
    term: '秋分',
    hou: '雷始收声，蛰虫坯户，水始涸',
    tasks: ['秋收大忙', '播种冬小麦', '油菜育苗', '果树采收']
  },
  '寒露': {
    term: '寒露',
    hou: '鸿雁来宾，雀入大水为蛤，菊有黄华',
    tasks: ['抢收水稻', '播种小麦', '棉花采收', '贮藏农产品']
  },
  '霜降': {
    term: '霜降',
    hou: '豺乃祭兽，草木黄落，蛰虫咸俯',
    tasks: ['晚稻收获', '小麦出苗', '果树防寒', '温室管理']
  },
  '立冬': {
    term: '立冬',
    hou: '水始冰，地始冻，雉入大水为蜃',
    tasks: ['冬小麦管理', '积肥造肥', '检修农机', '温室蔬菜']
  },
  '小雪': {
    term: '小雪',
    hou: '虹藏不见，天气上升，闭塞而成冬',
    tasks: ['麦田冬灌', '果树涂白', '贮藏蔬菜', '畜禽防寒']
  },
  '大雪': {
    term: '大雪',
    hou: '鹖鴠不鸣，虎始交，荔挺出',
    tasks: ['麦田镇压', '温室增温', '果树修剪', '准备春播种子']
  },
  '冬至': {
    term: '冬至',
    hou: '蚯蚓结，麋角解，水泉动',
    tasks: ['冬小麦越冬', '温室管理', '积肥造肥', '农具修理']
  },
  '小寒': {
    term: '小寒',
    hou: '雁北乡，鹊始巢，雉始鸲',
    tasks: ['麦田保温', '温室防寒', '果树防冻', '准备春耕']
  },
  '大寒': {
    term: '大寒',
    hou: '鸡始乳，征鸟厉疾，水泽腹坚',
    tasks: ['麦田管理', '温室增温', '积肥造肥', '春耕准备']
  }
};

export function getFarmTip(term: string): FarmTip | undefined {
  return FARM_DATA[term];
}

export function getAllFarmTips(): FarmTip[] {
  return SOLAR_TERMS.map(term => FARM_DATA[term]).filter(Boolean) as FarmTip[];
}

// 根据日期获取农事提示
export function getFarmTipByDate(_year: number, month: number, _day: number, solarTerm?: string): FarmTip | undefined {
  if (solarTerm && FARM_DATA[solarTerm]) {
    return FARM_DATA[solarTerm];
  }

  // 根据月份返回大致的农事提示
  const monthTips: Record<number, string> = {
    1: '大寒', 2: '立春', 3: '惊蛰', 4: '清明',
    5: '立夏', 6: '芒种', 7: '小暑', 8: '立秋',
    9: '白露', 10: '寒露', 11: '立冬', 12: '大雪'
  };

  const term = monthTips[month];
  return term ? FARM_DATA[term] : undefined;
}
