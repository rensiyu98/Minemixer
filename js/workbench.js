'use strict';
/* ============ 原版贴图工作台 / 详情对比 / 导出 ============ */
function selAdd(entry, quiet) {
  const path = entry.path;
  const existed = STATE.sel.get(path);
  STATE.sel.set(path, { packId: entry.packId, entry });
  saveSel();
  renderWorkbench();
  refreshCenterSel();   // ★ 立即刷新中栏绿✓(此前漏掉,导致加完✓不显示)
  if (!quiet) {
    if (existed && existed.packId !== entry.packId) toast(`「${entry.base}」改为使用「${packById(entry.packId).name}」的版本`);
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
  // 基底包选择器
  const bs = $('#baseSel');
  if (bs && !bs._init) {
    bs._init = true;
    bs.onchange = e => {
      localStorage.setItem('mm2_base', e.target.value);
      toast(e.target.value ? `基底已设为「${(packById(e.target.value) || {}).name}」：只补齐它的原版贴图` : '基底 = 原版（游戏自动回退原版贴图）');
    };
  }
  if (bs) {
    const cur = localStorage.getItem('mm2_base') || '';
    const html = '<option value="">原版(不垫,游戏自动回退)</option>' +
      STATE.packs.filter(p => p.textureCount > 0).map(p => `<option value="${p.id}">${p.name}（${p.textureCount} 项贴图）</option>`).join('');
    if (bs.dataset.sig !== html) { bs.dataset.sig = html; bs.innerHTML = html; bs.value = cur; }
  }
  renderCompatibility();
}
function selectionAudit() {
  const target = +($('#verSel2')?.value || 15), owners = new Map(), conflicts = [], deps = new Set(), incompatible = [], unknownLicense = [];
  for (const [, v] of STATE.sel) {
    const p = packById(v.packId), e = v.entry;
    if (!p) continue;
    if (p.packFormat != null && ((p.minFormat != null && target < p.minFormat) || (p.maxFormat != null && target > p.maxFormat))) incompatible.push(p.name);
    if (!p.license || /未知|unknown/i.test(p.license)) unknownLicense.push(p.name);
    if (e.deps) deps.add(e.deps);
    for (const f of e.files) {
      const old = owners.get(f.name);
      if (old && old.packId !== v.packId) conflicts.push({ path: f.name, a: old.name, b: p.name });
      else owners.set(f.name, { packId: v.packId, name: p.name });
      if (/\/optifine\/cit\/|\/citresewn\/cit\//i.test(f.name)) deps.add('OptiFine 或 CIT Resewn');
      if (/\/optifine\//i.test(f.name)) deps.add('OptiFine 或兼容模组');
    }
  }
  return { target, conflicts, deps: [...deps], incompatible: [...new Set(incompatible)], unknownLicense: [...new Set(unknownLicense)] };
}
function renderCompatibility() {
  const box = $('#compatPanel'); if (!box) return;
  if (!STATE.sel.size) { box.textContent = '选择条目后显示冲突、依赖与版本检查'; return; }
  const a = selectionAudit(), bits = [`<strong>${STATE.sel.size}</strong> 项`];
  bits.push(a.conflicts.length ? `<span class="badge bad">冲突 ${a.conflicts.length}</span>` : '<span class="badge ok">无文件冲突</span>');
  if (a.deps.length) bits.push(`<span class="badge warn" title="${a.deps.join('、')}">前置 ${a.deps.length}</span>`);
  if (a.incompatible.length) bits.push(`<span class="badge bad" title="${a.incompatible.join('、')}">版本风险 ${a.incompatible.length}</span>`); else bits.push('<span class="badge ok">目标版本通过</span>');
  if (a.unknownLicense.length) bits.push(`<span class="badge warn" title="${a.unknownLicense.join('、')}">授权待确认 ${a.unknownLicense.length}</span>`);
  box.innerHTML = `<div class="pack-health">${bits.join('')}</div>${a.deps.length ? `需要：${a.deps.join('、')}` : '模型、动画描述和所选技术文件会随条目一起导出。'}`;
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
  const cube = img && entry.cat === 'block' ? `<div class="preview3d" aria-label="方块旋转预览"><div class="cube3d" style="--tex:url(${img})">${['front','back','right','left','top','bottom'].map(x => `<span class="${x}"></span>`).join('')}</div></div>` : '';
  box.innerHTML = `
    <div class="dmain"><div class="dimg">${cube || (img ? `<img src="${img}">` : '<div class="dnoimg">📦 ' + (entry._err || '非贴图条目') + '<br><span style="font-size:10px">' + entry.files.slice(0, 6).map(f => f.name.split('/').pop()).join('<br>') + (entry.files.length > 6 ? '<br>…共' + entry.files.length + '个文件' : '') + '</span></div>')}</div>
    <div class="dinfo">
      <h3>${entry.base} ${zh}</h3>
      <p class="dpath">${entry.path}</p>
      <p>分类:${CAT_LABEL[entry.cat] || entry.cat} · 分组:${entry.group} · 命名空间:${entry.ns}</p>
      <p>来自:<b>${pack.name}</b>(${pack.license})</p>
      <p>文件数:${entry.files.length}${entry.frameCount > 1 ? ' · 动画 ' + entry.frameCount + ' 帧' : ''}</p>
      <button class="hbtn primary" id="dAdd">${STATE.sel.has(entry.path) ? (STATE.sel.get(entry.path).packId === entry.packId ? '✓ 已在工作台(点击移除)' : '换用此版本') : '＋ 加入混搭'}</button>
    </div></div>
    <div class="dab"><h4>同一贴图的不同材质包版本</h4><div id="abList" class="ablist"><span class="dim">检索中…</span></div></div>`;
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

/* ---------- 导出选中贴图；未覆盖的贴图由游戏原版回退 ---------- */
async function exportPack() {
  if (!STATE.sel.size) return;
  const audit = selectionAudit();
  const warnings = [];
  if (audit.conflicts.length) warnings.push(`${audit.conflicts.length} 个文件路径冲突（工作台中较早选择的版本优先）`);
  if (audit.incompatible.length) warnings.push(`目标格式 ${audit.target} 超出 ${audit.incompatible.join('、')} 声明的兼容范围`);
  if (audit.unknownLicense.length) warnings.push(`${audit.unknownLicense.join('、')} 的许可证未知，不应公开分发`);
  if (warnings.length && !confirm('导出前检查发现：\n\n• ' + warnings.join('\n• ') + '\n\n仍要生成仅供测试的资源包吗？')) return;
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
  const namesDone = new Set();   // 全局路径去重(基底垫底也用它)
  const emitFile = (pid, zip, zent) => {
    if (namesDone.has(zent.name)) return;
    namesDone.add(zent.name);
    files.push({ name: zent.name, data: ZR.read(zip, zent) });
  };
  for (const [, v] of STATE.sel) {
    const e = v.entry, pack = packById(v.packId);
    credit.set(pack.name, pack.license);
    const ctx = await ctxOf(v.packId); if (!ctx) continue;
    for (const f of e.files) { const z = ctx.byName.get(f.name); if (z) emitFile(v.packId, ctx.zip, z); }
  }
  outer: for (const [name] of credit) {
    const p = STATE.packs.find(x => x.name === name); if (!p) continue;
    const ctx = await ctxOf(p.id); if (!ctx) continue;
    const pz = ctx.byName.get('pack.png');
    if (pz) { emitFile(p.id, ctx.zip, pz); break outer; }
  }
  // 基底只补原版贴图条目，不复制原 ZIP 的音效、模型、模组文件。
  const baseId = localStorage.getItem('mm2_base') || '';
  let baseCount = 0, baseName = '';
  if (baseId) {
    const bp = packById(baseId);
    if (bp) {
      baseName = bp.name;
      const ctx = await ctxOf(baseId);
      if (ctx) for (const entry of STATE.entriesByPack.get(baseId) || []) for (const f of entry.files) {
        const z = ctx.byName.get(f.name);
        if (!z || namesDone.has(z.name)) continue;
        emitFile(baseId, ctx.zip, z); baseCount++;
      }
    }
  }
  const pf = +($('#verSel2').value || 15);
  const credits = [...credit.entries()].map(([n, l]) => `${n} (${l})`).join(' / ');
  // 材质包不挑版本:写 pack_format + supported_formats 区间(所选版本 → 未来版本全兼容)
  const desc = ['MineMixer v2.1 混搭包 · ' + STATE.sel.size + ' 项替换', '混搭自: ' + credits].join('\n');
  files.unshift({ name: 'pack.mcmeta', data: TE.encode(JSON.stringify({ pack: {
    pack_format: pf,
    supported_formats: { min_inclusive: pf, max_inclusive: 999 },
    description: desc,
  } }, null, 2)) });
  files.push({ name: 'MineMixer-CREDITS.txt', data: TE.encode([
    'MineMixer 混搭资源包', '生成时间：' + new Date().toISOString(), '目标 pack_format：' + pf,
    '来源与许可证：', ...[...credit.entries()].map(([n, l]) => `- ${n}: ${l}`), '',
    audit.deps.length ? '运行前置：' + audit.deps.join('、') : '运行前置：未检测到',
    '注意：本文件不代表原作者授权。公开发布前请检查每个来源的许可证与署名要求。'
  ].join('\n')) });
  const blob = zipStore(files);
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = 'MineMixer_v2.zip'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 500);
  toast(`⛏ 已生成 MineMixer_v2.zip：选中 ${STATE.sel.size} 项贴图${baseCount ? ` + 基底「${baseName}」补充 ${baseCount} 个文件` : ''}`);
}
