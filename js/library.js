'use strict';
/* ============ MineMixer v2.1 · 导入管线 + 工作台渲染(主界面/工作界面) ============ */
const STATE = {
  packs: [], entriesByPack: new Map(), zipCache: new Map(), thumbCache: new Map(),
  sel: new Map(),            // path → {packId, entry}
};
const WS = { cat: 'all', setPackId: null, q: '' };   // 工作台导航:当前大类 / 当前小类(包) / 搜索词
const packById = id => STATE.packs.find(p => p.id === id);
const CAT_MAP = { block: 'block', item: 'item', entity: 'entity', gui: 'gui', particle: 'particle', env: 'env',
  model: 'model', blockstate: 'model', cem: 'model', particledef: 'particle', cit: 'other', ofanim: 'other', misc: 'other' };
const PAGE = 240;

function packCapabilities(ents) {
  const names = ents.map(e => e.name.toLowerCase());
  const count = re => names.filter(n => re.test(n)).length;
  return {
    textures: count(/assets\/[^/]+\/textures\/.*\.(png|tga)$/),
    models: count(/assets\/[^/]+\/(models|blockstates)\/.*\.json$/),
    sounds: count(/assets\/[^/]+\/(?:sounds\/.*\.ogg|sounds\.json)$/),
    fonts: count(/assets\/[^/]+\/font\/.*\.json$/),
    animations: count(/\.png\.mcmeta$|\/animations?\/.*\.json$/),
    optifine: count(/assets\/[^/]+\/optifine\//),
    cit: count(/assets\/[^/]+\/(optifine\/cit|citresewn\/cit)\//),
  };
}
function readJsonEntry(buf, ents, name) {
  const e = ents.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!e) return null;
  try { return JSON.parse(new TextDecoder().decode(ZR.read(buf, e))); } catch (_) { return null; }
}
function inspectPack(buf, ents) {
  const manifest = readJsonEntry(buf, ents, 'manifest.json');
  const mc = readJsonEntry(buf, ents, 'pack.mcmeta');
  const hasJava = ents.some(e => /(?:^|\/)assets\/[^/]+\//i.test(e.name));
  const hasBedrock = !!manifest || ents.some(e => /(?:^|\/)(textures|sounds|ui)\//i.test(e.name) && !/(?:^|\/)assets\//i.test(e.name));
  const edition = hasJava && hasBedrock ? 'mixed' : hasJava || mc ? 'java' : hasBedrock ? 'bedrock' : 'unknown';
  const pack = mc && mc.pack || {};
  const pf = Number.isFinite(+pack.pack_format) ? +pack.pack_format : null;
  const sf = pack.supported_formats;
  let minFormat = pf, maxFormat = pf;
  if (Array.isArray(sf)) { minFormat = +sf[0]; maxFormat = +sf[1]; }
  else if (sf && typeof sf === 'object') { minFormat = +(sf.min_inclusive ?? pf); maxFormat = +(sf.max_inclusive ?? pf); }
  return { mc, manifest, edition, packFormat: pf, minFormat: Number.isFinite(minFormat) ? minFormat : null, maxFormat: Number.isFinite(maxFormat) ? maxFormat : null, capabilities: packCapabilities(ents) };
}

/* ---------- 导入(与之前一致) ---------- */
function mcmetaName(m) { try { return (m.pack.description || '').split('\n')[0].slice(0, 40); } catch (e) { return ''; } }
async function importZipBuffer(buf, meta) {
  const ents = await ZR.entries(buf);
  const scan = inspectPack(buf, ents), mc = scan.mc || {};
  if (scan.edition === 'bedrock') throw new Error('检测到基岩版资源包（manifest.json）。当前混搭引擎只支持 Java 版，已阻止错误导入');
  if (scan.edition === 'unknown') throw new Error('无法识别资源包平台：未找到 Java 版 assets/ 或基岩版 manifest.json');
  const parsed = buildEntries(ents);
  const entries = parsed.entries, textureEntries = selectVanillaTextureEntries(entries), modInfo = parsed.modInfo;
  if (!textureEntries.length && !entries.length) {
    const msum = modInfo.modNs.slice(0, 3).map(m => m.ns + '×' + m.count).join(', ');
    throw new Error('没有找到可混搭的原版贴图（assets/minecraft/textures/ 下的 PNG/TGA）' + (msum ? '；检测到模组命名空间：' + msum : ''));
  }
  const textureCount = textureEntries.length;
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pack = { id, name: meta.name || mcmetaName(mc) || '未命名包', author: meta.author || '', license: meta.license || '未知（仅限个人使用，导出前确认授权）', source: meta.source || 'local', importedAt: Date.now(), fileCount: ents.length, entryCount: entries.length, textureCount, modInfo, engineVersion: ENGINE_V, edition: scan.edition, packFormat: scan.packFormat, minFormat: scan.minFormat, maxFormat: scan.maxFormat, capabilities: scan.capabilities };
  await DB.putPack(pack, buf, entries);
  STATE.zipCache.set(id, buf);
  await reloadPacks();
  return pack;
}
async function importLocalFiles(files) {
  for (const f of files) {
    try {
      const pack = await importZipBuffer(await f.arrayBuffer(), { name: f.name.replace(/\.zip$/i, '') });
      toast(`✓ 已导入「${pack.name}」（Java · ${pack.textureCount} 张贴图 · ${pack.entryCount} 个资源条目）`);
      autoCheck(pack);
    } catch (e) { toast(`✕ 导入 ${f.name} 失败:${e.message}`, true); }
  }
}
async function autoCheck(pack) {   // 导入后自动完整度检测,覆盖率写入包卡片徽章
  try {
    const zip = STATE.zipCache.get(pack.id); if (!zip) return;
    const es = STATE.entriesByPack.get(pack.id) || [];
    if (es.length > 3000) return;   // 超大包跳过自动检测(可用包卡片按钮手动跑)
    const R = await checkPack(pack, es, zip);
    const kind = (R.cover[0] && R.cover[0].kind) || '';
    pack.score = R.score; pack.kind = kind;
    await DB.patchPack(pack.id, { score: R.score, kind });
    renderHome();
    toast(`🔍「${pack.name}」${R.verdict} · 原版覆盖率 ${R.score}%`, R.warn > 0);
  } catch (e) {}
}
const CURATED = CLOUD_LIBRARY.slice(0, 10);
async function importCloudPack(c) {
  let url = c.url;
  let license = c.lic;
  let author = c.url ? 'Cloud:' + c.slug : 'Modrinth:' + c.slug;
  if (!url) {
    const project = typeof modrinthJson === 'function'
      ? await modrinthJson(`project/${encodeURIComponent(c.slug)}`)
      : await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(c.slug)}`).then(r => r.json());
    if (project.project_type !== 'resourcepack') throw new Error('项目已不再是资源包');
    license = project.license && project.license.id;
    if (!license || license !== c.lic) throw new Error('项目许可证与清单不一致，请检查后再导入');
    const versions = typeof modrinthJson === 'function'
      ? await modrinthJson(`project/${encodeURIComponent(c.slug)}/version`)
      : await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(c.slug)}/version`).then(r => r.json());
    const file = versions.flatMap(v => v.files || []).find(f => f.primary && /\.zip(?:$|\?)/i.test(f.url))
      || versions.flatMap(v => v.files || []).find(f => /\.zip(?:$|\?)/i.test(f.url));
    if (!file) throw new Error('没有可用的资源包 zip');
    url = file.url;
  }
  const remoteUrl = new URL(url, location.href);
  let response = await fetch(remoteUrl.origin === location.origin ? remoteUrl.href : `/api/download?url=${encodeURIComponent(remoteUrl.href)}`);
  if (response.status === 404 && remoteUrl.origin !== location.origin) response = await fetch(remoteUrl.href);
  if (!response.ok) throw new Error('下载失败 (' + response.status + ')');
  const buf = await response.arrayBuffer();
  const pk = await importZipBuffer(buf, { name: c.name, license, source: c.url ? 'cloud' : 'modrinth', author });
  autoCheck(pk);
  return { pack: pk, bytes: buf.byteLength };
}
async function importCurated(onProgress) {
  let ok = 0, skipped = 0;
  for (const c of CURATED) {
    try {
      if (STATE.packs.some(p => p.author === 'Modrinth:' + c.slug || p.author === 'Cloud:' + c.slug)) { skipped++; continue; }
      onProgress(`正在获取 ${c.name}…`);
      const result = await importCloudPack(c);
      ok++; onProgress(`✓ ${c.name}(${Math.round(result.bytes / 1024)}KB)`);
    } catch (e) { onProgress(`✕ ${c.name}:${e.message}`); }
  }
  onProgress(`完成:新增 ${ok} 个，已存在 ${skipped} 个`);
}
async function reloadPacks() {
  STATE.packs = await DB.packs();
  for (const p of STATE.packs) if (!STATE.entriesByPack.has(p.id)) STATE.entriesByPack.set(p.id, await DB.entriesOf(p.id));
  const ids = new Set(STATE.packs.map(p => p.id));
  for (const k of [...STATE.entriesByPack.keys()]) if (!ids.has(k)) STATE.entriesByPack.delete(k);
  for (const [k, v] of [...STATE.sel]) if (!ids.has(v.packId)) STATE.sel.delete(k);
  renderHome();
  if (typeof renderCloud === 'function') renderCloud();
  if (typeof renderRail === 'function' && $('#viewWork').classList.contains('show')) { renderRail(); renderCenter(); renderWorkbench(); }
}

/* ---------- 主界面:包管理 ---------- */
function renderHome() {
  const box = $('#homePacks'); box.innerHTML = '';
  if (!STATE.packs.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">还没有导入材质包 —— 拖入一个材质包 zip，或从精选库挑选</div>'; return; }
  for (const p of STATE.packs) {
    const el = document.createElement('div'); el.className = 'hpack';
    const licOk = /MIT|Apache|CC0|CC-BY|LGPL|MPL|GPL/.test(p.license);
    const caps = p.capabilities || {};
    const fmt = p.packFormat == null ? '版本未知' : `格式 ${p.minFormat == null ? p.packFormat : p.minFormat}${p.maxFormat != null && p.maxFormat !== p.minFormat ? '–' + p.maxFormat : ''}`;
    el.innerHTML = `<h3>${p.name}</h3>
      <div class="meta"><span class="lic ${licOk ? 'ok' : ''}">${p.license.slice(0, 20)}</span><span>${p.textureCount != null ? p.textureCount + ' 项贴图 · ' : ''}${p.fileCount} 条目 · ${(p.size / 1048576).toFixed(1)}MB</span></div>
      <div class="pack-health"><span class="badge ok">Java</span><span class="badge ${p.packFormat == null ? 'warn' : ''}">${fmt}</span>${caps.models ? `<span class="badge">模型 ${caps.models}</span>` : ''}${caps.sounds ? `<span class="badge">声音 ${caps.sounds}</span>` : ''}${caps.fonts ? `<span class="badge">字体 ${caps.fonts}</span>` : ''}${caps.optifine ? `<span class="badge warn">OptiFine ${caps.optifine}</span>` : ''}${caps.cit ? `<span class="badge warn">CIT ${caps.cit}</span>` : ''}</div>
      ${p.score != null ? `<div class="meta" style="color:${p.score >= 85 ? 'var(--acc)' : 'var(--acc2)'};font-size:11px">原版覆盖 ${p.score}% · ${p.kind || ''}</div>` : ''}
      ${p.modInfo && p.modInfo.modNs.length ? `<div class="meta" style="color:var(--txt3);font-size:10.5px">已过滤 mod 资源:${p.modInfo.modNs.slice(0, 3).map(m => m.ns + '×' + m.count).join('、')}${p.modInfo.modNs.length > 3 ? '…' : ''}</div>` : ''}
      <div class="ops"><button class="hbtn chk">🔍 检测完整度</button><button class="hbtn rm">✕ 移除</button></div>`;
    el.querySelector('.rm').onclick = async () => {
      if (!confirm(`移除「${p.name}」?工作台中来自此包的选择也会清除。`)) return;
      await DB.delPack(p.id); STATE.zipCache.delete(p.id);
      for (const k of [...STATE.thumbCache.keys()]) if (k.startsWith(p.id + '|')) STATE.thumbCache.delete(k);
      await reloadPacks(); toast('已移除');
    };
    el.querySelector('.chk').onclick = async () => {
      toast('🔍 正在检测 ' + p.name + ' …');
      let zip = STATE.zipCache.get(p.id) || await DB.packZip(p.id);
      if (!zip) { toast('读取包数据失败', true); return; }
      STATE.zipCache.set(p.id, zip);
      try { showCheckReport(await checkPack(p, STATE.entriesByPack.get(p.id) || [], zip)); }
      catch (e) { toast('检测出错: ' + e.message, true); }
    };
    box.appendChild(el);
  }
}

/* ---------- 工作界面:左栏大类 ---------- */
function isTechCat(c) { return c === 'model' || c === 'blockstate' || c === 'cem' || c === 'ofanim' || c === 'particledef'; }
function allEntries() { let l = []; for (const es of STATE.entriesByPack.values()) l = l.concat(es); return l; }
function renderRail() {
  const rail = $('#rail'); rail.innerHTML = '';
  const counts = new Map(); let mixTotal = 0, techTotal = 0;
  for (const e of allEntries()) {
    const c = CAT_MAP[e.cat] || 'other';
    if (c === 'model') { techTotal++; continue; }   // 技术/模型类单独计,不混入贴图大类
    counts.set(c, (counts.get(c) || 0) + 1); mixTotal++;
  }
  for (const c of CATS) {
    let n;
    if (c.id === 'all') n = mixTotal;
    else if (c.id === 'model') n = techTotal;
    else n = counts.get(c.id) || 0;
    const el = document.createElement('div');
    el.className = 'rcat' + (WS.cat === c.id ? ' active' : '');
    el.innerHTML = `<span>${c.name}</span><span class="n">${n}</span>`;
    el.onclick = () => { WS.cat = c.id; WS.setPackId = null; WS.q = ''; $('#wsSearch').value = ''; renderRail(); renderCenter(); };
    rail.appendChild(el);
  }
}

/* ---------- 工作界面:中栏(小类墙 / 条目网格) ---------- */
function renderCenter() {
  const stage = $('#stage'), crumb = $('#crumb'), census = $('#census');
  stage.dataset.cap = PAGE;
  const catName = (CATS.find(c => c.id === WS.cat) || { name: '全部' }).name;
  if (WS.q) {
    const q = WS.q.toLowerCase();
    const list = allEntries().filter(e => e.base.toLowerCase().includes(q) || e.path.toLowerCase().includes(q) || (e.zh && e.zh.includes(WS.q)));
    crumb.innerHTML = `🔍 搜索「${WS.q}」 <b onclick="WS.q='';document.querySelector('#wsSearch').value='';renderCenter()">✕ 清除</b>`;
    census.textContent = `${list.length} 个条目 · 来自所有资源包`;
    renderEntryGrid(stage, list);
    return;
  }
  if (WS.setPackId) {
    const p = packById(WS.setPackId);
    if (!p) { WS.setPackId = null; renderCenter(); return; }
    const es = (STATE.entriesByPack.get(p.id) || []).filter(e => {
      const c = CAT_MAP[e.cat] || 'other';
      if (WS.cat === 'all') return c !== 'model';
      if (WS.cat === 'model') return c === 'model';
      return c === WS.cat;
    });
    crumb.innerHTML = `<b onclick="WS.setPackId=null;renderCenter()">‹ ${catName}</b> / ${p.name}`;
    census.textContent = `${p.name} · ${es.length} 个条目 · 点条目加入工作台,或整卡拖走`;
    renderEntryGrid(stage, es);
    return;
  }
  // 小类墙:每个包一张卡(同作者/同套装 = 一个小类)
  const mixFilter = e => {
    const c = CAT_MAP[e.cat] || 'other';
    if (WS.cat === 'all') return c !== 'model';              // 「全部」只显贴图条目
    if (WS.cat === 'model') return c === 'model';            // 模型大类=技术文件集中地
    return c === WS.cat;                                     // 其他大类本就只有贴图
  };
  crumb.innerHTML = `<span>${catName}</span>`;
  const sets = STATE.packs.map(p => ({
    p,
    es: (STATE.entriesByPack.get(p.id) || []).filter(mixFilter),
  })).filter(s => s.es.length).sort((a, b) => b.es.length - a.es.length);
  const total = sets.reduce((s, x) => s + x.es.length, 0);
  census.textContent = `${catName} · ${total} 个条目,分布在 ${sets.length} 个小类(资源包)—— 点卡片查看条目,或直接拖整卡到右侧工作台`;
  stage.innerHTML = ''; const wall = document.createElement('div'); wall.className = 'setwall';
  for (const s of sets) {
    const card = document.createElement('div'); card.className = 'setcard'; card.draggable = true;
    card.innerHTML = `<h4>${s.p.name}</h4>
      <div class="smeta">${(s.p.author && !s.p.author.startsWith('Modrinth:')) ? s.p.author + ' · ' : ''}${s.p.license.slice(0, 18)}</div>
      <div class="scount">${s.es.length} 个条目</div>
      <div class="setthumbs">${[0, 1, 2, 3].map(() => '<div class="gt">…</div>').join('')}</div>
      <div class="hint">🖱 点击查看 · ✋ 拖整组到工作台</div>`;
    card.onclick = () => { WS.setPackId = s.p.id; renderCenter(); };
    card.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', 'set|' + s.p.id + '|' + WS.cat); ev.dataTransfer.effectAllowed = 'copy'; });
    wall.appendChild(card);
    (async () => {
      const strip = card.querySelector('.setthumbs');
      const withPng = s.es.filter(e => e.files.some(f => /\.png$/i.test(f.name))).slice(0, 4);
      for (let i = 0; i < withPng.length; i++) {
        const url = await makeThumb(withPng[i]);
        if (url && strip.children[i]) { strip.children[i].style.backgroundImage = `url(${url})`; strip.children[i].textContent = ''; }
      }
    })();
  }
  stage.appendChild(wall);
  if (!sets.length) stage.innerHTML = '<div class="empty">这个大类还没有内容<br>回主界面导入更多资源包</div>';
}
function renderEntryGrid(stage, list) {
  stage.innerHTML = '';
  const cap = +(stage.dataset.cap || PAGE);
  const show = list.slice(0, cap);
  const grid = document.createElement('div'); grid.className = 'entrygrid';
  for (const e of show) {
    const cell = document.createElement('div'); cell.className = 'ecell'; cell.draggable = true;
    const selHere = STATE.sel.has(e.path) && STATE.sel.get(e.path).packId === e.packId;
    if (selHere) cell.classList.add('sel');
    const pk = packById(e.packId);
    cell.innerHTML = `<div class="eth">📦</div><div class="elb">${e.zh || e.base}</div><div class="epk">${pk ? pk.name : ''}</div>`;
    cell.title = (e.zh ? e.zh + ' · ' : '') + e.base + '\n' + e.path + '\n点击=加入/移出 · 可拖到工作台';
    cell.onclick = () => { (STATE.sel.has(e.path) && STATE.sel.get(e.path).packId === e.packId) ? toast('✓ 已在工作台(移除请在右栏点 ✕)') : selAdd(e); };
    cell.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', 'entry|' + e.packId + '|' + e.path); ev.dataTransfer.effectAllowed = 'copy'; });
    grid.appendChild(cell);
    lazyThumbEth(cell.firstChild, e);
  }
  stage.appendChild(grid);
  if (list.length > show.length) {
    const more = document.createElement('button'); more.className = 'hbtn loadmore';
    more.textContent = `加载更多(还有 ${list.length - show.length} 个)`;
    more.onclick = () => { stage.dataset.cap = cap + PAGE; renderEntryGrid(stage, list); };
    stage.appendChild(more);
  }
  if (!list.length) stage.innerHTML = '<div class="empty">没有匹配的条目</div>';
  $('#dbg').textContent = `stage渲染 ${show.length} 个条目 | sel=${STATE.sel.size}`;
}
function lazyThumbEth(el, entry) {
  const cached = STATE.thumbCache.get(entry.id);
  if (cached === 'none') return;
  if (cached) { el.style.backgroundImage = `url(${cached})`; el.textContent = ''; return; }
  thumbQ2.push({ el, entry });
  if (!thumbBusy2) pump2();
}
const thumbQ2 = []; let thumbBusy2 = false;
async function pump2() {
  thumbBusy2 = true;
  while (thumbQ2.length) {
    const { el, entry } = thumbQ2.shift();
    const url = await makeThumb(entry);
    STATE.thumbCache.set(entry.id, url || 'none');
    if (url && el.isConnected) { el.style.backgroundImage = `url(${url})`; el.textContent = ''; }
    await new Promise(r => setTimeout(r, 0));
  }
  thumbBusy2 = false;
}
async function makeThumb(entry) {
  const main = entry.files.find(f => /\.(png)$/i.test(f.name));
  if (!main) return null;
  let zip = STATE.zipCache.get(entry.packId);
  if (!zip) { zip = await DB.packZip(entry.packId); if (zip) STATE.zipCache.set(entry.packId, zip); }
  if (!zip) return null;
  try {
    const bytes = ZR.read(zip, main);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const cv = mkCanvas(48, 48), x = cv.getContext('2d');
    const s = Math.max(48 / bmp.width, 48 / bmp.height);
    x.imageSmoothingEnabled = false;
    x.drawImage(bmp, (48 - bmp.width * s) / 2, (48 - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    return cv.toDataURL('image/png');
  } catch (e) { return null; }
}
async function makeThumb2(entry, size) {
  const cached = STATE.thumbCache.get(entry.id);
  if (cached && cached !== 'none') return cached;   // 网格已生成的图直接复用
  const main = entry.files.find(f => /\.(png|tga)$/i.test(f.name));
  if (!main) { entry._err = '该条目不含贴图文件'; return null; }
  let zip = STATE.zipCache.get(entry.packId) || await DB.packZip(entry.packId);
  if (!zip) { entry._err = '包数据未加载'; return null; }
  STATE.zipCache.set(entry.packId, zip);
  try {
    const bytes = ZR.read(zip, main);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const cv = mkCanvas(size, size), x = cv.getContext('2d');
    const s = Math.max(size / bmp.width, size / bmp.height);
    x.imageSmoothingEnabled = false;
    x.drawImage(bmp, (size - bmp.width * s) / 2, (size - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    return cv.toDataURL('image/png');
  } catch (e) {
    entry._err = '解码失败:' + (e && e.message ? e.message : JSON.stringify(e).slice(0, 60)) + ' (' + main.name.split('/').pop() + ')';
    const c = STATE.thumbCache.get(entry.id);
    return (c && c !== 'none') ? c : null;
  }
}
