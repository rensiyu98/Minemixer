'use strict';
/* ============ 路径解析 / 自动分类 / 文件配对 ============ */
const ENGINE_V = 7;   // 分类引擎版本(改动解析逻辑时+1;启动时自动重建旧索引)
/* 分类体系(基于真实资源包解剖):
   block方块 item物品 entity实体 gui界面 particle粒子 env环境 model模型 blockstate方块状态
   cem实体模型动画 cit物品皮肤 ofanim动画贴图 particledef粒子定义 misc其他 */

const CATS = [
  { id: 'all',     name: '全部' },
  { id: 'block',   name: '方块' },
  { id: 'item',    name: '物品' },
  { id: 'entity',  name: '实体' },
  { id: 'gui',     name: '界面' },
  { id: 'particle',name: '粒子' },
  { id: 'env',     name: '环境' },
  { id: 'model',   name: '模型与状态' },
  { id: 'other',   name: '其他' },
];

/* 方块虚拟分组(规则映射,非物理目录) */
const BLOCK_GROUPS = [
  [/(_ore|^ancient_debris)/, '矿石'], [/(planks|_log$|_wood$|bamboo_block|_stem$)/, '木材'],
  [/(dirt|grass_block|podzol|mycelium|mud|sand$|red_sand|gravel|clay|soul_sand|soul_soil|moss_block|farmland)/, '泥土沙石'],
  [/(stone|deepslate|granite|diorite|andesite|tuff|calcite|basalt|blackstone|cobblestone|obsidian|bedrock|netherrack|nylium|end_stone|amethyst)/, '石材'],
  [/glass/, '玻璃'], [/(door|trapdoor|fence|sign|hanging_sign|button|pressure_plate|stairs|slab|wall$|ladder|scaffolding|chain|iron_bars)/, '建筑构件'],
  [/(wool|carpet|bed|banner|concrete|terracotta|shulker)/, '彩色方块'],
  [/(bricks|tile|copper|quartz|purpur|prismarine|sandstone|bricks$)/, '建筑材料'],
  [/(furnace|chest|barrel|hopper|dispenser|dropper|anvil|crafter|table|beacon|bookshelf|jukebox|note_block|spawner|vault|cauldron|composter|bell|campfire|beehive|bee_nest|conduit|respawn_anchor|lodestone|grindstone|loom|lectern|porous)/, '功能方块'],
  [/(rail|torch|lantern|lamp|light|candle|campfire|sea_lantern|glowstone|shroomlight|copper_bulb|froglight|lever|redstone|repeater|comparator|target|daylight|observer|piston|tripwire|command_block|structure|jigsaw|tnt|dispenser)/, '光源与技术'],
  [/(sapling|flower|tulip|daisy|orchid|allium|bluet|cornflower|lily|rose|peony|lilac|sunflower|mushroom|fern|grass$|tall_grass|short_grass|leaves|vine|lichen|roots|sprouts|fungus|azalea|pitcher|torchflower|petals|dripleaf|blossom|seagrass|kelp|coral|dead_bush|cactus|sugar_cane|wheat|carrots|potatoes|beetroots|cocoa|wart|berries|pvore)/, '植物'],
  [/(ice|snow|powder_snow|water|lava|magma|frosted)/, '冰雪流体'],
  [/(_head$|_skull$|dragon_egg)/, '头颅与蛋'],
  [/(destroy|web|cobweb|fire|portal)/, '特殊'],
];
const ITEM_GROUPS = [
  [/(_sword$|_pickaxe$|_axe$|_shovel$|_hoe$|^bow$|crossbow|trident|shield|elytra|_rod$|shears|flint_and_steel|fishing_rod|mace|arrow|_on_a_stick)/, '工具武器'],
  [/(apple|bread|beef|porkchop|chicken|mutton|rabbit|cod|salmon|fish|rotten_flesh|spider_eye|carrot|potato|beetroot|stew|soup|cookie|pie|cake|kelp|berries|honey|milk|bucket|egg|dried|sweet_|sugar|melon)/, '食物'],
  [/(ingot|nugget|gem|^diamond$|^emerald$|^coal$|charcoal|lapis|redstone$|quartz$|amethyst_shard|echo_shard|pearl|eye|tear|star|shard|scrap|scute|membrane|shell|bone|meal|string|feather|flint$|leather|hide|paper|stick|gunpowder|powder|rod$)/, '材料'],
  [/(helmet|chestplate|leggings|boots|turtle_helmet|smithing_template|trim)/, '盔甲纹饰'],
  [/(potion|bottle|splash|lingering|brewing|fermented|spider_eye)/, '药水酿造'],
  [/(music_disc|disc|goat_horn|firework|banner_pattern|pottery_sherd|sherds)/, '唱片与杂项'],
];
function groupOf(cat, sub, path){
  if (cat === 'block') { for (const [re, g] of BLOCK_GROUPS) if (re.test(sub)) return g; return '其他方块'; }
  if (cat === 'item')  { for (const [re, g] of ITEM_GROUPS)  if (re.test(sub)) return g; return '其他物品'; }
  return null; // 其他类目按自身结构分组
}

/* 解析 zip 内一条路径 → {ns, cat, group, sub, base} 或 null(非资源) */
function parsePath(p){
  // 允许 overlay 目录前缀:<dir>/assets/... 以及根 assets/...
  let rest = null;
  if (p.startsWith('assets/')) rest = p.slice(7);
  else { const i = p.indexOf('/assets/'); if (i > 0) rest = p.slice(i + 8); }
  if (!rest) return null;
  const seg = rest.split('/');
  const ns = seg.shift();
  const r = seg.join('/');
  const last = seg[seg.length - 1];
  const baseRaw = last.replace(/\.(png|json|mcmeta|jem|jpm|properties|txt|tga|fsh|vsh)$/i, '');
  const isMcmetaSidecar = /\.png\.mcmeta$/i.test(last);
  const ext = (last.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();

  const mk = (cat, group, sub) => ({ ns, cat, group: group || groupOf(cat, sub || baseRaw, r), sub: sub || baseRaw, base: baseRaw, ext, isMcmetaSidecar, rel: r });

  if (isMcmetaSidecar) return { ns, sidecarOf: p.replace(/\.mcmeta$/i, ''), isMcmetaSidecar };

  if (seg[0] === 'textures') {
    const t = seg[1];
    if (t === 'block' && ext === 'png') return mk('block', null);
    if (t === 'item' && ext === 'png') return mk('item', null);
    if (t === 'entity' && ext === 'png') return mk('entity', seg[2] || '其他', seg[2] || baseRaw);
    if (t === 'gui' && ext === 'png') return mk('gui', seg[2] || '界面', seg[2] || baseRaw);
    if (t === 'particle' && ext === 'png') return mk('particle', '粒子', baseRaw.replace(/_\d+$/, ''));
    if (t === 'environment' && (ext === 'png' || ext === 'tga')) return mk('env', '环境');
    return mk('misc', t || '其他贴图', t === undefined ? baseRaw : (seg[2] || baseRaw));
  }
  if (seg[0] === 'models' && ext === 'json') return mk('model', '模型/' + (seg[1] || ''), seg.slice(1).join('/'));
  if (seg[0] === 'blockstates' && ext === 'json') return mk('blockstate', '方块状态');
  if (seg[0] === 'particles' && ext === 'json') return mk('particledef', '粒子定义');
  // mod 扩展目录(如 Cobblemon bedrock 动画)按语义归类
  if (['bedrock', 'animations', 'animation'].includes(seg[0]) && /animation/i.test(r)) return mk('model', '动画');
  if (['geo', 'geometries', 'models'].includes(seg[0]) && /\.geo\.json$/i.test(last)) return mk('model', '几何模型');
  if (seg[0] === 'optifine') {
    if (seg[1] === 'cem') return mk('cem', '实体模型动画', baseRaw.replace(/_animations?$/, ''));
    if (seg[1] === 'cit') return mk('cit', '物品皮肤CIT', seg.slice(2).join('/').replace(/\.[^.]+$/, ''));
    if (seg[1] === 'anim') return mk('ofanim', 'OptiFine动画');
    return mk('misc', 'OptiFine其他');
  }
  if (seg[0] === 'font' || seg[0] === 'texts' || seg[0] === 'sounds') return mk('misc', seg[0] === 'sounds' ? '声音' : (seg[0] === 'font' ? '字体' : '文本'));
  if (seg[0] === 'lang') return mk('misc', '语言文件');
  if (seg[0] === 'shaders' || seg[0] === 'post_effect') return mk('misc', '着色器');
  if (seg[0] === 'atlases') return mk('misc', '图集定义');
  if (seg[0] === 'equipment') return mk('misc', '装备外观');
  if (seg[0] === 'items' && ext === 'json') return mk('item', '物品定义');
  if (seg[0] === 'waypoint_style') return mk('misc', '路点样式');
  return mk('misc', '其他');
}

const CAT_LABEL = { block: '方块', item: '物品', entity: '实体', gui: '界面', particle: '粒子', env: '环境',
  model: '模型', blockstate: '方块状态', cem: '实体模型', cit: '物品皮肤', ofanim: 'OF动画', particledef: '粒子定义', misc: '其他' };
const DEPS = { cem: 'OptiFine / EMF(实体模型前置)', cit: 'OptiFine / CIT Resewn', ofanim: 'OptiFine' };
const isVanillaTexture = name => /(?:^|\/)assets\/minecraft\/textures\/.+\.(?:png|tga)$/i.test(name);
function selectVanillaTextureEntries(entries) {
  return entries.map(entry => {
    const images = entry.files.filter(f => isVanillaTexture(f.name));
    if (!images.length) return null;
    const names = new Set(images.map(f => f.name + '.mcmeta'));
    const sidecars = entry.files.filter(f => names.has(f.name));
    return { ...entry, files: [...images, ...sidecars], deps: null };
  }).filter(Boolean);
}
function countVanillaTextures(entries) { return selectVanillaTextureEntries(entries).length; }

/* 把一个包的全部文件列表 → 条目列表(贴图中心模型:模型/方块状态吸附到同名贴图) */
function buildEntries(files /* [{name,size,method,localOff}] */){
  const raws = new Map();
  for (const f of files) {
    const info = parsePath(f.name);
    if (!info) continue;
    if (info.isMcmetaSidecar) { raws.set(f.name, { sidecar: info.sidecarOf, f }); continue; }
    raws.set(f.name, { info, f });
  }
  /* --- 第一遍:建立吸附目标索引 --- */
  // 同 ns 下,按 base 名把 blockstate/model 归并到贴图(路径语义等价:xxx.json ↔ xxx.png)
  const texByBase = new Map(); // `${ns}|${base}` → [paths...] 贴图路径
  const attachable = [];       // blockstate/model 条目 {path, r}
  for (const [path, r] of raws) {
    if (!r.info) continue;
    const { cat, ns, base } = r.info;
    if (cat === 'block' || cat === 'item' || cat === 'entity' || cat === 'gui' || cat === 'env' || cat === 'particle' || (cat === 'misc' && /\.png$/i.test(path))) {
      const k = `${ns}|${base}`;
      if (!texByBase.has(k)) texByBase.set(k, []);
      texByBase.get(k).push(path);
    } else if (cat === 'blockstate' || cat === 'model') {
      attachable.push({ path, r });
    }
  }
  // blockstate 的 base 与贴图 base 一致(同名);model 的 base 也常一致(oak_leaves.json→oak_leaves.png)
  const attachMap = new Map(); // model/blockstate path → 贴图 path(吸附目标)
  for (const a of attachable) {
    const { ns, base } = a.r.info;
    const cands = texByBase.get(`${ns}|${base}`) || [];
    if (cands.length) attachMap.set(a.path, cands[0]);
  }
  /* --- 第二遍:条目分组 --- */
  const merged = new Map();
  const skip = new Set(attachMap.keys()); // 被吸附的不再独立成条
  for (const [path, r] of raws) {
    if (!r.info || skip.has(path)) continue;
    const { cat, base } = r.info;
    let key = path;
    if (cat === 'particle') key = `${r.info.ns}|particle|${base}`;
    if (!merged.has(key)) merged.set(key, []);
    merged.get(key).push({ path, r });
  }
  // 吸附执行
  for (const [mpath, tpath] of attachMap) {
    if (merged.has(tpath)) {
      const r = raws.get(mpath);
      merged.get(tpath).push({ path: mpath, r });
    }
  }
  // 粒子帧已经天然同 key;cem jpm 归并 jem
  for (const [path, r] of raws) {
    if (r.info && r.info.cat === 'cem' && /\.jpm$/i.test(path)) {
      const jname = path.replace(/_animations?\.jpm$/i, '.jem').replace(/\.jpm$/i, '.jem');
      if (merged.has(jname)) merged.get(jname).push({ path, r });
      else if (!skip.has(path)) { if (!merged.has(path)) merged.set(path, []); merged.get(path).push({ path, r }); }
    }
  }
  // CIT properties → 同名 png
  for (const [path, r] of raws) {
    if (r.info && r.info.cat === 'cit' && /\.properties$/i.test(path)) {
      const stem = path.replace(/\.properties$/i, '');
      for (const key of merged.keys()) {
        if (key !== path && (key === stem || key.startsWith(stem + '_') || key.startsWith(stem + '/')) && /\.png$/i.test(key)) {
          merged.get(key).push({ path, r }); break;
        }
      }
    }
  }
  const entries = [];
  const modNs = new Map();   // mod 命名空间 → 条目数(非原版覆盖,不入库)
  for (const [key, list] of merged) {
    const first = list.find(x => x.r && x.r.info) || list[0];
    const info = first.r && first.r.info;
    if (!info) continue;
    // ★ 定位原则:只收原版(minecraft 命名空间)覆盖 —— mod/整合包专用材质不参与混搭
    if (info.ns !== 'minecraft') {
      modNs.set(info.ns, (modNs.get(info.ns) || 0) + 1);
      continue;
    }
    const filesOf = list.map(x => ({ name: x.path, size: x.r.f.size, method: x.r.f.method, localOff: x.r.f.localOff, compSize: x.r.f.compSize })).sort((a, b) => a.name.localeCompare(b.name));
    for (const [mPath, mR] of raws) {
      if (mR.sidecar) {
        const target = filesOf.find(x => x.name === mR.sidecar);
        if (target && !filesOf.some(x => x.name === mPath)) filesOf.push({ name: mPath, size: mR.f.size, method: mR.f.method, localOff: mR.f.localOff, compSize: mR.f.compSize });
      }
    }
    // 分类重判定:带贴图的 model 条目提升为贴图类目
    let cat = info.cat, group = info.group;
    const hasTex = filesOf.some(f => /textures\/.*(png|tga)$/i.test(f.name));
    if ((cat === 'model' || cat === 'misc') && hasTex) {
      const m = filesOf.find(f => /textures\/([^/]+)\//i.exec(f.name));
      const mm = m && /textures\/([^/]+)\//i.exec(m.name);
      if (mm) {
        const t = mm[1];
        if (t === 'block') { cat = 'block'; group = null; }
        else if (t === 'item') { cat = 'item'; group = null; }
        else if (t === 'entity') { cat = 'entity'; group = (info.group || '').split('/').pop(); }
        else if (t === 'gui') { cat = 'gui'; }
        else if (t === 'particle') { cat = 'particle'; }
        else if (t === 'environment') { cat = 'env'; }
      }
    }
    if (!group) group = groupOf(cat, info.sub || info.base, key);
    const zh = zhName(info.sub) || zhName(info.base) || (cat === 'entity' ? zhName(info.group || '') : null);
    entries.push({
      path: key, ns: info.ns, cat, group: group || CAT_LABEL[cat] || '其他',
      sub: info.sub, base: info.base, zh: zh || null, frameCount: filesOf.filter(f => /\.png$/i.test(f.name)).length,
      files: filesOf, deps: DEPS[cat] || null,
    });
  }
  return { entries, modInfo: { modNs: [...modNs.entries()].map(([ns, count]) => ({ ns, count })).sort((a, b) => b.count - a.count) } };
}
