'use strict';
/* ============ 工作台(按小类分组) / 详情对比 / 导出(含依赖补齐) ============ */
const DEP_LINKS = [
  { key: 'EMF', name: 'EMF(实体模型功能)', url: 'https://modrinth.com/mod/entity-model-features' },
  { key: 'CIT Resewn', name: 'CIT Resewn(物品皮肤)', url: 'https://modrinth.com/mod/citresewn' },
  { key: 'OptiFine', name: 'OptiFine', url: 'https://optifine.net/home' },
];
function selAdd(entry, quiet) {
  const path = entry.path;
  const existed = STATE.sel.get(path);
  STATE.sel.set(path, { packId: entry.packId, entry });
  saveSel();
  renderWorkbench();
  refreshCenterSel();   // ★ 立即刷新中栏绿✓(此前漏掉,导致加完✓不显示)
  if (!quiet) {
    if (existed && existed.packId !== entry.packId) toast(`「${entry.base}」改为使用「${packById(entry.packId).name}」的版本`);
    else if (entry.deps) toast(`⚠ 该条目需要前置:${entry.deps}`, true);
  }
}
function selAddSet(entries, packName) {
  let n = 0;
  for (const e of entries) { STATE.sel.set(e.path, { packId: e.packId, entry: e }); n++; }
  saveSel(); renderWorkbench(); refreshCenterSel();
  toast(`✓ 已加入小类「${packName}」全部 ${n} 个条目`);
}
function selRemove(path) { STATE.sel.delete(path); saveSel(); renderWorkbench(); refreshCenterSel(); }
function refreshCenterSel() {
  if (!$('#viewWork') || !$('#viewWork').classList.contains('show')) return;
  const st = $('#stage'), top = st.scrollTop;
  renderCenter(); st.scrollTop = top;
}
function saveSel() { localStorage.setItem('mm2_sel', JSON.stringify([...STATE.sel].map(([p, v]) => [p, v.packId]))); }
function loadSel() {
  try {
    for (const [path, packId] of JSON.parse(localStorage.getItem('mm2_sel') || '[]')) {
      const entry = (STATE.entriesByPack.get(packId) || []).find(e => e.path === path);
      if (entry) STATE.sel.set(path, { packId, entry });
    }
  } catch (e) {}
}
function renderWorkbench() {
  const box = $('#wbList'); if (!box) return;
  box.innerHTML = '';
  if (!STATE.sel.size) { box.innerHTML = '<div class="empty">从小类墙拖整卡,或点单个条目加入<br>同目标多版本可在行点击里对比换用</div>'; }
  const groups = new Map(); // packId → [[path, v]...]
  for (const [path, v] of STATE.sel) {
    if (!groups.has(v.packId)) groups.set(v.packId, []);
    groups.get(v.packId).push([path, v]);
  }
  for (const [pid, rows] of groups) {
    const p = packById(pid); if (!p) continue;
    const g = document.createElement('div'); g.className = 'wbgrp';
    g.innerHTML = `<div class="wbgh"><span>${p.name}</span><span style="color:var(--txt3);font-size:10.5px">${p.license.slice(0, 14)}</span><button class="allrm">全移除</button></div>`;
    g.querySelector('.allrm').onclick = () => { for (const [path] of rows) STATE.sel.delete(path); saveSel(); renderWorkbench(); refreshCenterSel(); };
    for (const [path, v] of rows) {
      const e = v.entry;
      const row = document.createElement('div'); row.className = 'wbrow';
      row.innerHTML = `<span class="wbtag">${CAT_LABEL[e.cat] || e.cat}</span><span class="wbn">${e.zh || e.base}</span><button class="del">✕</button>`;
      row.querySelector('.del').onclick = ev => { ev.stopPropagation(); selRemove(path); };
      row.onclick = () => openDetail(e);   // 行点击=大图+各包版本对比
      row.title = '点击查看大图与各包版本对比';
      g.appendChild(row);
    }
    box.appendChild(g);
  }
  const n = STATE.sel.size;
  $('#wbCount') && ($('#wbCount').textContent = n);
  const btns = [$('#btnPack2'), $('#btnPack2b')];
  btns.forEach(b => b && (b.disabled = !n));
  // 前置模组面板:选中内容里需要 mod 依附的,列出清单与下载页
  const deps = new Map();
  for (const [, v] of STATE.sel) if (v.entry.deps) for (const d of DEP_LINKS) if ((v.entry.deps || '').includes(d.key)) deps.set(d.key, d);
  if (deps.size) {
    const depBox = document.createElement('div'); depBox.className = 'wbgrp';
    depBox.innerHTML = '<div class="wbgh" style="color:#ffcf6b">⚠ 需要前置模组(装进 mods 文件夹才生效)</div>' +
      [...deps.values()].map(d => `<div class="wbrow"><span class="wbtag">前置</span><span class="wbn">${d.name}</span><button class="del" style="color:var(--acc2)" onclick="window.open('${d.url}')">下载页 ↗</button></div>`).join('');
    box.appendChild(depBox);
  }
  // 基底包选择器
  const bs = $('#baseSel');
  if (bs && !bs._init) {
    bs._init = true;
    bs.onchange = e => {
      localStorage.setItem('mm2_base', e.target.value);
      toast(e.target.value ? `基底已设为「${(packById(e.target.value) || {}).name}」:未选材质将全部用它垫底` : '基底 = 原版(不垫,游戏自动回退原版)');
    };
  }
  if (bs) {
    const cur = localStorage.getItem('mm2_base') || '';
    const html = '<option value="">原版(不垫,游戏自动回退)</option>' +
      STATE.packs.map(p => `<option value="${p.id}">${p.name}(${(p.size / 1048576).toFixed(1)}MB 全量垫底)</option>`).join('');
    if (bs.dataset.sig !== html) { bs.dataset.sig = html; bs.innerHTML = html; bs.value = cur; }
  }
}
/* 拖放目标:支持整小类(set)与单条目(entry) */
(function () {
  const panel = () => $('#wsRight');
  addEventListener('DOMContentLoaded', () => {});
  window.initWsDrop = function () {
    const p = panel(); if (!p || p._dropInit) return; p._dropInit = true;
    p.addEventListener('dragover', ev => { ev.preventDefault(); p.classList.add('dragover'); });
    p.addEventListener('dragleave', () => p.classList.remove('dragover'));
    p.addEventListener('drop', ev => {
      ev.preventDefault(); p.classList.remove('dragover');
      const s = ev.dataTransfer.getData('text/plain'); if (!s) return;
      const [kind, pid, rest] = s.split('|');
      const es = STATE.entriesByPack.get(pid) || [];
      if (kind === 'set') {
        const list = es.filter(e => rest === 'all' || CAT_MAP[e.cat] === rest);
        if (list.length) selAddSet(list, (packById(pid) || {}).name || '小类');
      } else if (kind === 'entry') {
        const en = es.find(x => x.path === rest);
        if (en) selAdd(en, true) || renderWorkbench();
      }
    });
  };
})();

/* ---------- 详情弹窗(A/B 对比) ---------- */
async function openDetail(entry) {
  const ov = $('#detailOv'); ov.classList.add('show');
  const pack = packById(entry.packId);
  const box = $('#detailBody');
  const zh = entry.zh ? `(${entry.zh})` : '';
  const img = await makeThumb2(entry, 220);
  box.innerHTML = `
    <div class="dmain"><div class="dimg">${img ? `<img src="${img}">` : '<div class="dnoimg">📦 ' + (entry._err || '非贴图条目') + '<br><span style="font-size:10px">' + entry.files.slice(0, 6).map(f => f.name.split('/').pop()).join('<br>') + (entry.files.length > 6 ? '<br>…共' + entry.files.length + '个文件' : '') + '</span></div>'}</div>
    <div class="dinfo">
      <h3>${entry.base} ${zh}</h3>
      <p class="dpath">${entry.path}</p>
      <p>分类:${CAT_LABEL[entry.cat] || entry.cat} · 分组:${entry.group} · 命名空间:${entry.ns}</p>
      <p>来自:<b>${pack.name}</b>(${pack.license})</p>
      <p>文件数:${entry.files.length}${entry.frameCount > 1 ? ' · 动画 ' + entry.frameCount + ' 帧' : ''}</p>
      ${entry.deps ? `<p class="ddep">⚠ 需要前置模组:${entry.deps}</p>` : ''}
      <button class="hbtn primary" id="dAdd">${STATE.sel.has(entry.path) ? (STATE.sel.get(entry.path).packId === entry.packId ? '✓ 已在工作台(点击移除)' : '换用此版本') : '＋ 加入混搭'}</button>
    </div></div>
    <div class="dab"><h4>同目标对比(各资源包版本)</h4><div id="abList" class="ablist"><span class="dim">检索中…</span></div></div>`;
  $('#dAdd').onclick = () => {
    if (STATE.sel.has(entry.path) && STATE.sel.get(entry.path).packId === entry.packId) { selRemove(entry.path); ov.classList.remove('show'); }
    else { selAdd(entry); ov.classList.remove('show'); }
  };
  const all = await DB.byPath(entry.path);
  const abBox = $('#abList'); abBox.innerHTML = '';
  for (const e2 of all) {
    const p2 = packById(e2.packId); if (!p2) continue;
    const card = document.createElement('div'); card.className = 'abcard' + (e2.packId === entry.packId ? ' cur' : '');
    card.innerHTML = `<div class="abth"></div><div class="abname">${p2.name}</div><div class="ablic">${p2.license.slice(0, 16)}</div><button class="abuse">使用</button>`;
    const t = await makeThumb2(e2, 120);
    card.querySelector('.abth').style.backgroundImage = t ? `url(${t})` : '';
    card.querySelector('.abuse').onclick = () => { selAdd(e2); ov.classList.remove('show'); };
    abBox.appendChild(card);
  }
  if (!abBox.children.length) abBox.innerHTML = '<span class="dim">没有其他版本</span>';
}
$('#detailOv').onclick = e => { if (e.target.id === 'detailOv') e.target.classList.remove('show'); };

/* ---------- 导出(依赖闭包:未选文件回退原版) ---------- */
function refsFromJson(text) {
  const out = new Set();
  const re = /"([a-z0-9_.-]+):([a-z0-9_/.-]+?)"/gi;
  let m;
  while ((m = re.exec(text))) {
    const ns = m[1], rel = m[2];
    if (!/^(minecraft|[a-z][a-z0-9_-]+)$/.test(ns)) continue;
    if (/^(block|item|entity|gui|particle|environment|models|blockstates|textures|optifine|font|texts|particles|sounds)\//.test(rel)) out.add(ns + ':' + rel);
  }
  return out;
}
async function exportPack() {
  if (!STATE.sel.size) return;
  const files = [];
  const TE = new TextEncoder();
  const credit = new Map();
  const zc = new Map();
  const ctxOf = async pid => {
    if (!zc.has(pid)) {
      const zip = STATE.zipCache.get(pid) || await DB.packZip(pid);
      if (!zip) { zc.set(pid, null); return null; }
      STATE.zipCache.set(pid, zip);
      const ents = await ZR.entries(zip);
      zc.set(pid, { zip, ents, byName: new Map(ents.map(z => [z.name, z])) });   // O(1) 查找,防大包卡死
    }
    return zc.get(pid);
  };
  const resolveRef = (ents, ns, rel) => {
    for (const c of [`assets/${ns}/textures/${rel}.png`, `assets/${ns}/textures/${rel}.png.mcmeta`,
      `assets/${ns}/models/${rel}.json`, `assets/${ns}/blockstates/${rel}.json`,
      `assets/${ns}/${rel}.png`, `assets/${ns}/${rel}.json`, `assets/${ns}/${rel}.png.mcmeta`, `assets/${ns}/${rel}`]) {
      const hit = ents.find(x => x.name === c); if (hit) return hit;
    }
    return null;
  };
  const emitted = new Set();
  const namesDone = new Set();   // 全局路径去重(基底垫底也用它)
  const emitFile = (pid, zip, zent) => {
    if (namesDone.has(zent.name)) return;
    namesDone.add(zent.name);
    emitted.add(pid + '|' + zent.name);
    files.push({ name: zent.name, data: ZR.read(zip, zent) });
  };
  const collectDeps = (pid, ctx, entry, depth) => {
    if (depth > 4) return;
    for (const f of entry.files) {
      if (!/\.json$/i.test(f.name)) continue;
      const z = ctx.byName.get(f.name); if (!z) continue;
      let text = '';
      try { text = new TextDecoder().decode(ZR.read(ctx.zip, z)); } catch (e) { continue; }
      for (const ref of refsFromJson(text)) {
        const [rns, rel] = ref.split(':');
        if (rns !== entry.ns) continue;   // 只补同包依赖;minecraft: 等由原版回退
        const hit = ctx.byName.get(`assets/${entry.ns}/textures/${rel}.png`)
          || ctx.byName.get(`assets/${entry.ns}/models/${rel}.json`)
          || ctx.byName.get(`assets/${entry.ns}/blockstates/${rel}.json`)
          || ctx.byName.get(`assets/${entry.ns}/${rel}.png`)
          || ctx.byName.get(`assets/${entry.ns}/${rel}.json`);
        if (!hit) continue;
        if (!namesDone.has(hit.name)) {
          emitFile(pid, ctx.zip, hit);
          collectDeps(pid, ctx, { ns: entry.ns, files: [hit] }, depth + 1);
        }
      }
    }
  };
  for (const [, v] of STATE.sel) {
    const e = v.entry, pack = packById(v.packId);
    credit.set(pack.name, pack.license);
    const ctx = await ctxOf(v.packId); if (!ctx) continue;
    for (const f of e.files) { const z = ctx.byName.get(f.name); if (z) emitFile(v.packId, ctx.zip, z); }
    collectDeps(v.packId, ctx, e, 0);
  }
  outer: for (const [name] of credit) {
    const p = STATE.packs.find(x => x.name === name); if (!p) continue;
    const ctx = await ctxOf(p.id); if (!ctx) continue;
    const pz = ctx.byName.get('pack.png');
    if (pz) { emitFile(p.id, ctx.zip, pz); break outer; }
  }
  // 基底垫底:选中与依赖之外的材质,全部用基底包补齐(防紫黑缺失)
  const baseId = localStorage.getItem('mm2_base') || '';
  let baseCount = 0, baseName = '';
  if (baseId) {
    const bp = packById(baseId);
    if (bp) {
      baseName = bp.name;
      const ctx = await ctxOf(baseId);
      if (ctx) for (const z of ctx.ents) {
        if (namesDone.has(z.name) || /\\|pack\.mcmeta$/.test(z.name)) continue;
        if (/pack\.png$/.test(z.name) && namesDone.has('pack.png')) continue;
        files.push({ name: z.name, data: ZR.read(ctx.zip, z) });
        namesDone.add(z.name); baseCount++;
      }
    }
  }
  // 前置模组说明随包输出
  const depMods = new Map();
  for (const [, v] of STATE.sel) if (v.entry.deps) for (const d of DEP_LINKS) if ((v.entry.deps || '').includes(d.key)) depMods.set(d.key, d);
  const depArr = [...depMods.values()];
  if (depArr.length) files.push({ name: '⚠前置模组安装说明.txt', data: TE.encode(
    ['本混搭包包含需要前置模组的内容:', '',
     ...depArr.map(d => `· ${d.name}  下载: ${d.url}`), '',
     '安装:将下载的 mod jar 放入 .minecraft/mods 文件夹(需对应的 Fabric/Forge 加载器)。',
     '不安装前置时,对应内容不会生效,但不影响包内其他部分。'].join('\r\n')) });
  const pf = +($('#verSel2').value || 15);
  const credits = [...credit.entries()].map(([n, l]) => `${n} (${l})`).join(' / ');
  // 材质包不挑版本:写 pack_format + supported_formats 区间(所选版本 → 未来版本全兼容)
  const desc = ['MineMixer v2.1 混搭包 · ' + STATE.sel.size + ' 项替换', '混搭自: ' + credits].join('\n');
  files.unshift({ name: 'pack.mcmeta', data: TE.encode(JSON.stringify({ pack: {
    pack_format: pf,
    supported_formats: { min_inclusive: pf, max_inclusive: 999 },
    description: desc,
  } }, null, 2)) });
  const blob = zipStore(files);
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = 'MineMixer_v2.zip'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 500);
  toast(`⛏ 已生成 MineMixer_v2.zip:${files.length} 文件 = 选中 ${STATE.sel.size} 项 + 依赖补齐${baseCount ? ` + 基底「${baseName}」垫底 ${baseCount} 项` : ''}`);
}
