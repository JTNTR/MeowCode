/**
 * horoscope.js - 喵喵运势计算引擎
 * 基于日期种子的确定性日运生成，纯客户端计算，无后端依赖
 */

// ==================== 星座数据 ====================
var SIGNS = [
  { id: 0,  name: '白羊座', emoji: '♈', element: '火', month: [3,21], monthEnd: [4,19],
    traits: ['热情', '勇敢', '直率'], ruler: '火星' },
  { id: 1,  name: '金牛座', emoji: '♉', element: '土', month: [4,20], monthEnd: [5,20],
    traits: ['稳重', '务实', '坚韧'], ruler: '金星' },
  { id: 2,  name: '双子座', emoji: '♊', element: '风', month: [5,21], monthEnd: [6,21],
    traits: ['机智', '好奇', '善变'], ruler: '水星' },
  { id: 3,  name: '巨蟹座', emoji: '♋', element: '水', month: [6,22], monthEnd: [7,22],
    traits: ['温柔', '体贴', '敏感'], ruler: '月亮' },
  { id: 4,  name: '狮子座', emoji: '♌', element: '火', month: [7,23], monthEnd: [8,22],
    traits: ['自信', '慷慨', '领导力'], ruler: '太阳' },
  { id: 5,  name: '处女座', emoji: '♍', element: '土', month: [8,23], monthEnd: [9,22],
    traits: ['细心', '严谨', '完美主义'], ruler: '水星' },
  { id: 6,  name: '天秤座', emoji: '♎', element: '风', month: [9,23], monthEnd: [10,23],
    traits: ['优雅', '公正', '社交'], ruler: '金星' },
  { id: 7,  name: '天蝎座', emoji: '♏', element: '水', month: [10,24], monthEnd: [11,22],
    traits: ['深邃', '执着', '神秘'], ruler: '冥王星' },
  { id: 8,  name: '射手座', emoji: '♐', element: '火', month: [11,23], monthEnd: [12,21],
    traits: ['乐观', '自由', '冒险'], ruler: '木星' },
  { id: 9,  name: '摩羯座', emoji: '♑', element: '土', month: [12,22], monthEnd: [1,19],
    traits: ['自律', '耐心', '务实'], ruler: '土星' },
  { id: 10, name: '水瓶座', emoji: '♒', element: '风', month: [1,20], monthEnd: [2,18],
    traits: ['创新', '独立', '博爱'], ruler: '天王星' },
  { id: 11, name: '双鱼座', emoji: '♓', element: '水', month: [2,19], monthEnd: [3,20],
    traits: ['浪漫', '感性', '同理心'], ruler: '海王星' }
];

// ==================== 幸运元素库 ====================
var LUCKY_COLORS = [
  { name: '樱花粉', hex: '#FFB7C5' },
  { name: '珊瑚橘', hex: '#FF7F50' },
  { name: '天空蓝', hex: '#87CEEB' },
  { name: '薄荷绿', hex: '#98FB98' },
  { name: '薰衣草紫', hex: '#DDA0DD' },
  { name: '柠檬黄', hex: '#FFF44F' },
  { name: '蜜桃橙', hex: '#FFCBA4' },
  { name: '雾霾蓝', hex: '#A8D8EA' },
  { name: '玫瑰红', hex: '#FF6B8A' },
  { name: '奶油白', hex: '#FFFDD0' },
  { name: '抹茶绿', hex: '#C1E0C1' },
  { name: '香槟金', hex: '#F7E7CE' }
];

var LUCKY_NUMBERS = [1,2,3,4,5,6,7,8,9];

var LUCKY_DIRECTIONS = ['东方', '东南方', '南方', '西南方', '西方', '西北方', '北方', '东北方'];

// ==================== 每日箴言库 ====================
var MOTTOS = [
  '今天是你余生中最年轻的一天，去发光吧 ✨',
  '与其仰望星空，不如去做摘星星的人 🌟',
  '温柔地对待自己，世界也会温柔待你 💕',
  '好运藏在努力里，今天也要加油呀 🍀',
  '保持可爱，好事正在发生 🐱',
  '你值得世间所有的美好，包括今天 ☀️',
  '哪怕只有1%的希望，也要付出100%的努力 💪',
  '生活明朗，万物可爱，未来可期 🌈',
  '别急，最好的总是在不经意间出现 🎁',
  '每一个不曾起舞的日子，都是对自己的辜负 💃',
  '心之所向，素履以往 🌿',
  '做自己的太阳，无需凭借谁的光 🔆',
  '人生没有白走的路，每一步都算数 👣',
  '今天的烦恼，会在明天的阳光下消散 ☁️',
  '你比你想象的更强大，相信自己 ⭐',
  '微笑是世界上最美的语言，多笑笑吧 😊',
  '把握当下，就是最好的未来 🎯',
  '愿你眼里有星辰，身边有微风，心中有暖阳 🌻',
  '不念过往，不畏将来，活在当下 🎈',
  '小小的坚持，会成就大大的梦想 🌱',
  '你是独一无二的，没有人能替代你的光芒 💎',
  '今天会遇到惊喜，请保持期待 🎀',
  '善良是一种选择，选择善良的你最美 🌸',
  '机会总是留给有准备的人，你准备好了吗 🚀',
  '每一天都是一个新的开始，从心出发 ❤️',
  '星光不问赶路人，时光不负有心人 🌙',
  '有些路很远，走下去会很累，可是不走会后悔 🏃',
  '最美不是下雨天，是和你一起躲过雨的屋檐 ☂️',
  '愿你所愿，终能实现 🎋',
  '保持热爱，奔赴山海 ⛰️'
];

// ==================== 运势维度文案库 ====================
var FORTUNE_TEXTS = {
  love: {
    high: [
      '桃花运爆棚！今天魅力值MAX，容易收获好感与关注',
      '和TA心有灵犀的一天，甜蜜指数飙升',
      '适合表白或约会，浪漫氛围满分',
      '感情运势极佳，可能会收到意外惊喜',
      '人缘超好的一天，身边的人都想靠近你'
    ],
    mid: [
      '感情平平淡淡才是真，享受当下的安稳',
      '适合与伴侣好好沟通，增进彼此了解',
      '可能会有小摩擦，但也是增进感情的机会',
      '单身的朋友今天适合多出去社交',
      '感情上没有大的波动，保持平常心就好'
    ],
    low: [
      '今天容易因为小事产生误会，请多一些耐心',
      '感情上需要多一些包容和理解',
      '不适合做重大感情决定，先冷静一下',
      '可能会感到孤独，但这也是成长的一部分',
      '多给自己一些独处的时间，好好爱自己'
    ]
  },
  career: {
    high: [
      '事业运高涨！今天效率超高，适合挑战难题',
      '贵人运强，可能会得到领导或同事的认可',
      '创意灵感迸发，抓住这个好时机',
      '适合主动争取机会，表现出色会让人刮目相看',
      '今天是展示你专业能力的好日子'
    ],
    mid: [
      '按部就班完成工作任务就好，稳扎稳打',
      '适合整理工作思路，为之后做准备',
      '可能会有一些琐事需要处理，耐心应对',
      '与同事的合作会比较顺利，多沟通',
      '保持专注，做好手头的事情就是胜利'
    ],
    low: [
      '今天工作上可能会遇到一些阻力，保持冷静',
      '不适合做重要决策，先把能做的事情做好',
      '可能会感到有些疲惫，适当休息很重要',
      '与同事沟通时注意措辞，避免不必要的误解',
      '别给自己太大压力，你已经做得很好了'
    ]
  },
  health: {
    high: [
      '精力充沛！今天适合运动健身，状态极佳',
      '身心状态都很好，适合开启新的健康计划',
      '睡眠质量好，一整天都有好精神',
      '适合户外活动，多呼吸新鲜空气',
      '身体状态满分，可以适当挑战高强度运动'
    ],
    mid: [
      '身体状况平稳，保持规律作息就好',
      '注意饮食均衡，多吃蔬菜水果',
      '适合做一些轻度运动，比如散步或瑜伽',
      '精神状态不错，继续保持好习惯',
      '记得多喝水，保持身体水分'
    ],
    low: [
      '今天可能会感到有些疲惫，注意休息',
      '适当放慢节奏，不要透支自己的身体',
      '注意颈椎和肩部的放松，久坐记得活动',
      '饮食清淡一些，给肠胃放个假',
      '早点休息，充足的睡眠是最好的恢复'
    ]
  },
  wealth: {
    high: [
      '财运亨通！可能会有意外收入或投资回报',
      '理财决策比较准确，适合规划财务',
      '偏财运不错，可能会有小惊喜',
      '今天适合处理金钱相关的事务',
      '会有不错的消费体验，花得开心也值'
    ],
    mid: [
      '财运平稳，按计划消费就好',
      '适合做一些长期的理财规划',
      '控制购物欲，理性消费是王道',
      '可能会有些小额支出，但都在可控范围',
      '量入为出，保持财务健康'
    ],
    low: [
      '今天谨慎消费，避免冲动购物',
      '不适合做大的投资决策，观望为主',
      '可能会有一些意外支出，提前做好准备',
      '注意保管好贵重物品，防止遗失',
      '暂时不要借钱或参与风险投资'
    ]
  }
};

// ==================== 种子随机数生成器 ====================
function seededRandom(seed) {
  var x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getDailySeed(signId) {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth() + 1;
  var d = now.getDate();
  // 以日期+星座ID生成唯一种子
  return (y * 10000 + m * 100 + d) * 13 + signId * 7 + 3;
}

// ==================== 星座查询 ====================

/**
 * 根据生日获取星座
 * @param {number} month - 月份 (1-12)
 * @param {number} day - 日期 (1-31)
 * @returns {object} 星座对象
 */
function getSignByBirthday(month, day) {
  for (var i = 0; i < SIGNS.length; i++) {
    var s = SIGNS[i];
    var startM = s.month[0], startD = s.month[1];
    var endM = s.monthEnd[0], endD = s.monthEnd[1];

    if (startM > endM) {
      // 跨年星座（摩羯座 12.22-1.19）
      if ((month === startM && day >= startD) || (month === endM && day <= endD)) {
        return s;
      }
    } else {
      if ((month === startM && day >= startD) || (month === endM && day <= endD) ||
          (month > startM && month < endM)) {
        return s;
      }
    }
  }
  return SIGNS[0]; // fallback
}

/**
 * 获取今日对应的星座（当天日期落在哪个星座范围）
 */
function getCurrentSign() {
  var now = new Date();
  return getSignByBirthday(now.getMonth() + 1, now.getDate());
}

// ==================== 运势生成 ====================

/**
 * 生成指定星座的今日运势
 * @param {number} signId - 星座ID (0-11)
 * @returns {object} 运势数据
 */
function getDailyFortune(signId) {
  var seed = getDailySeed(signId);
  var sign = SIGNS[signId];

  // 综合评分 2.0-5.0，种子确定性
  var r1 = seededRandom(seed);
  var overall = Math.round((2.0 + r1 * 3.0) * 10) / 10;

  // 各维度评分
  var scores = {
    love:   getScore(seed + 100, overall),
    career: getScore(seed + 200, overall),
    health: getScore(seed + 300, overall),
    wealth: getScore(seed + 400, overall)
  };

  // 各维度文案
  var texts = {
    love:   pickFortuneText('love', scores.love, seed + 10),
    career: pickFortuneText('career', scores.career, seed + 20),
    health: pickFortuneText('health', scores.health, seed + 30),
    wealth: pickFortuneText('wealth', scores.wealth, seed + 40)
  };

  // 幸运元素
  var lucky = getLuckyElements(seed, sign);

  // 每日箴言
  var mottoIdx = Math.floor(seededRandom(seed + 500) * MOTTOS.length);
  var motto = MOTTOS[mottoIdx];

  // 今日关键词
  var traitIdx = Math.floor(seededRandom(seed + 600) * sign.traits.length);
  var keyword = sign.traits[traitIdx];

  // 今日日期
  var now = new Date();
  var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
  var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  var weekDay = '星期' + weekDays[now.getDay()];

  return {
    sign: sign,
    date: dateStr,
    weekDay: weekDay,
    overall: overall,
    starsArray: toStarsArray(overall),
    scores: scores,
    scoreDisplays: {
      love: toStars(scores.love),
      career: toStars(scores.career),
      health: toStars(scores.health),
      wealth: toStars(scores.wealth)
    },
    scoreStars: {
      love: toStarsArray(scores.love),
      career: toStarsArray(scores.career),
      health: toStarsArray(scores.health),
      wealth: toStarsArray(scores.wealth)
    },
    texts: texts,
    lucky: lucky,
    motto: motto,
    keyword: keyword,
    starDisplay: toStars(overall)
  };
}

function getScore(seed, baseScore) {
  var r = seededRandom(seed);
  // 在 baseScore ±1.5 范围内波动，限制在 1.0-5.0
  var score = baseScore + (r - 0.5) * 3;
  score = Math.max(1.0, Math.min(5.0, score));
  return Math.round(score * 10) / 10;
}

function pickFortuneText(category, score, seed) {
  var pool;
  if (score >= 4.0) {
    pool = FORTUNE_TEXTS[category].high;
  } else if (score >= 2.5) {
    pool = FORTUNE_TEXTS[category].mid;
  } else {
    pool = FORTUNE_TEXTS[category].low;
  }
  var idx = Math.floor(seededRandom(seed) * pool.length);
  return pool[idx];
}

function getLuckyElements(seed, sign) {
  var colorIdx = Math.floor(seededRandom(seed + 50) * LUCKY_COLORS.length);
  var numIdx = Math.floor(seededRandom(seed + 60) * LUCKY_NUMBERS.length);
  var dirIdx = Math.floor(seededRandom(seed + 70) * LUCKY_DIRECTIONS.length);

  return {
    color: LUCKY_COLORS[colorIdx],
    number: LUCKY_NUMBERS[numIdx],
    direction: LUCKY_DIRECTIONS[dirIdx]
  };
}

function toStars(score) {
  var full = Math.floor(score);
  var half = (score - full) >= 0.5 ? 1 : 0;
  var empty = 5 - full - half;
  var stars = '';
  for (var i = 0; i < full; i++) stars += '★';
  if (half) stars += '⭑';
  for (var j = 0; j < empty; j++) stars += '☆';
  return stars;
}

/**
 * 返回星星数组 [{state:'full'|'half'|'empty'}]，供页面逐颗渲染
 */
function toStarsArray(score) {
  var full = Math.floor(score);
  var half = (score - full) >= 0.5 ? 1 : 0;
  var empty = 5 - full - half;
  var arr = [];
  for (var i = 0; i < full; i++) arr.push('full');
  if (half) arr.push('half');
  for (var j = 0; j < empty; j++) arr.push('empty');
  return arr;
}

// ==================== 导出 ====================
module.exports = {
  SIGNS: SIGNS,
  getSignByBirthday: getSignByBirthday,
  getCurrentSign: getCurrentSign,
  getDailyFortune: getDailyFortune,
  seededRandom: seededRandom,
  toStars: toStars,
  toStarsArray: toStarsArray
};
