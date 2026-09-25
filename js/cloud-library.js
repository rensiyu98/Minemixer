'use strict';
/* ============ 云端包库清单(可被所有人扩充:编辑本文件或提交 PR 即可) ============ */
/* 每一项: { slug: Modrinth项目标识, name: 显示名, lic: 许可证, tags: [分类标签] } */
/* 导入时应用自动从 Modrinth API 解析最新版本并下载;包文件也可换成自建对象存储直链(url 字段优先) */
const CLOUD_LIBRARY = [
  { slug: 'vanilla-pvp-textures', name: 'Vanilla PvP Textures', lic: 'MIT', tags: ['全套'] },
  { slug: 'aerox-16x', name: 'Aerox 16x', lic: 'MIT', tags: ['全套'] },
  { slug: 'spbr', name: 'SPBR', lic: 'GPL-3.0-or-later', tags: ['全套'] },
  { slug: 'yuushya-16x', name: 'Yuushya 16x', lic: 'MIT', tags: ['全套'] },
  { slug: 'fresh-vanilla-textures', name: 'Fresh Vanilla Textures', lic: 'CC-BY-NC-SA-4.0', tags: ['全细节'] },
  { slug: 'connected-vanilla-textures', name: 'Connected Vanilla Textures', lic: 'CC-BY-NC-SA-4.0', tags: ['全细节'] },
  { slug: 'better-leaves', name: 'Better Leaves', lic: 'MIT', tags: ['树叶'] },
  { slug: 'fast-better-grass', name: 'Fast Better Grass', lic: 'MIT', tags: ['方块'] },
  { slug: 'default-dark-mode', name: 'Default Dark Mode', lic: 'CC-BY-NC-SA-4.0', tags: ['界面'] },
  { slug: 'new-glowing-ores', name: 'New Glowing Ores', lic: 'CC-BY-NC-SA-4.0', tags: ['矿石'] },
  { slug: 'even-better-enchants', name: 'Even Better Enchants', lic: 'Apache-2.0', tags: ['附魔'] },
  { slug: 'visual-armor-trims', name: 'Visual Armor Trims', lic: 'CC-BY-SA-4.0', tags: ['纹饰'] },
  { slug: 'round-trees', name: 'Round Trees', lic: 'MIT', tags: ['模型'] },
  { slug: 'comforts-modernized', name: 'Comforts Modernized', lic: 'LGPL-3.0-only', tags: ['家具'] },
];
