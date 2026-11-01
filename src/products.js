'use strict';
const { readJson, writeJson } = require('./store');

// 蓝海小众实物日用品示例（契合无货源/一件代发，资质少、毛利高、轻售后）
const SEED_PRODUCTS = [
  {
    id: 'p_clean_brush',
    title: '缝隙清洁软毛刷（键盘/窗缝/首饰）',
    subtitle: '超细软毛 · 一刷多用',
    desc: '超细软毛，深入缝隙除尘，可水洗重复使用。家庭清洁刚需小件，复购高、几乎无售后。',
    price: 19.9,
    stock: 999,
    image: '🧹',
    gallery: ['🧹', '🪥', '✨'],
    category: '家居清洁',
    tag: '蓝海',
    sales: 1280,
  },
  {
    id: 'p_pet_nail',
    title: '宠物指甲打磨器（静音防应激）',
    subtitle: '低噪打磨 · 告别剪指甲挣扎',
    desc: '低噪打磨替代剪指甲，减少宠物应激。养宠人群愿意为体验付费，口碑复购双高。',
    price: 49.9,
    stock: 999,
    image: '🐾',
    gallery: ['🐾', '🐶', '💅'],
    category: '宠物用品',
    tag: '热销',
    sales: 860,
  },
  {
    id: 'p_plant_root',
    title: '植物生根液（养花促根）',
    subtitle: '扦插成活率翻倍',
    desc: '家庭园艺高频消耗品，复购强、几乎无售后。新手养花也能轻松爆盆。',
    price: 25.0,
    stock: 999,
    image: '🌱',
    gallery: ['🌱', '🪴', '💧'],
    category: '园艺耗材',
    tag: '新品',
    sales: 540,
  },
  {
    id: 'p_elder_grip',
    title: '老人浴室防滑扶手（免打孔）',
    subtitle: '居家安全 · 免打孔安装',
    desc: '中老年居家安全刚需，竞争分散、客单适中。免打孔不伤瓷砖，租房也能装。',
    price: 39.9,
    stock: 999,
    image: '🛡️',
    gallery: ['🛡️', '🚿', '🤝'],
    category: '中老年辅具',
    tag: '匠心',
    sales: 320,
  },
  {
    id: 'p_left_scissors',
    title: '左手专用剪刀（左撇子刚需）',
    subtitle: '为左撇子而生',
    desc: '小众人群精准需求，比价意愿低、溢价空间大。顺手才是硬道理。',
    price: 29.9,
    stock: 999,
    image: '✂️',
    gallery: ['✂️', '✋', '🎨'],
    category: '小众工具',
    tag: '蓝海',
    sales: 210,
  },
  {
    id: 'p_desk_organizer',
    title: '免打孔隐形收纳架（租房党）',
    subtitle: '不伤墙 · 一贴即用',
    desc: '不伤墙面、小巧便宜，租房/宿舍高频需求。桌面瞬间清爽。',
    price: 22.5,
    stock: 999,
    image: '📦',
    gallery: ['📦', '🧺', '🏠'],
    category: '收纳',
    tag: '热销',
    sales: 990,
  },
];

function getAll() {
  // 首次运行时写入种子数据
  let list = readJson('products', null);
  if (!list) {
    list = SEED_PRODUCTS;
    writeJson('products', list);
  }
  return list;
}

function getById(id) {
  return getAll().find((p) => p.id === id) || null;
}

module.exports = { getAll, getById, SEED_PRODUCTS };
