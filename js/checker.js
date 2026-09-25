'use strict';
/* ============ 材质包完整性检测 ============ */
/* 三层检测:结构合法 / 内部引用一致 / 原版覆盖率(vs VANILLA 基准) */
function vanillaIndex() {
  if (vanillaIndex._c) return vanillaIndex._c;
  const m = new Map(); // 目录类别 → Set(paths)
  for (const p of VANILLA.paths) {
    const mm = p.match(/^assets\/minecraft\/(textures\/[a-z_]+|models|blockstates|particles)\//);
    if (!mm) continue;
    const key = mm[1];   // 'textures/block'、'models'、…
    if (!m.has(key)) m.set(key, new Set());
    m.get(key).add(p);
  }
  vanillaIndex._c = m;
  return m;
}
async function checkPack(pack, entries, zip) {
  const R = { pack: pack.name, struct: [], refs: [], cover: [], score: null, warn: 0, info: 0 };
  const ents = await ZR.entries(zip);
  const paths = new Set(ents.map(x => x.name));   // 用原始 zip 全路径(含 pack.mcmeta/pack.png)
  // ---- 1. 结构 ----
  const hasMc = paths.has('pack.mcmeta');
  R.struct.push({ ok: hasMc, t: hasMc ? 'pack.mcmeta 存在' : '缺少 pack.mcmeta(资源包必需!)' });
  if (hasMc) {
    try {
      const mc = JSON.parse(new TextDecoder().decode(ZR.read(zip, ents.find(x => x.name === 'pack.mcmeta'))));
      R.struct.push({ ok: true, t: `pack.mcmeta 合法 · pack_format=${mc.pack && mc.pack.pack_format}` });
    } catch (e) { R.struct.push({ ok: false, t: 'pack.mcmeta 不是合法 JSON' }); R.warn++; }
  } else R.warn++;
  R.struct.push({ ok: paths.has('pack.png'), t: paths.has('pack.png') ? 'pack.png 封面存在' : '无 pack.png 封面(可选,不影响使用)', soft: true });
  // ---- 2. 内部引用一致(blockstate→model→texture,读 JSON 内容,上限 2000 个防卡) ----
  const resolveModel = (ns, rel) => `assets/${ns}/models/${rel.replace(/^\w+\//, m => m)}.json`;
  let jsonChecked = 0, fallbackModel = 0, fallbackTex = 0, missingTex = 0;
  const texSet = new Set([...paths].filter(p => /\.(png|tga)$/i.test(p)));
  for (const p of paths) {
    if (jsonChecked >= 2000) break;
    const isBs = /assets\/([^/]+)\/blockstates\/.+\.json$/.exec(p);
    const isMd = /assets\/([^/]+)\/models\/.+\.json$/.exec(p);
    if (!isBs && !isMd) continue;
    const ns = (isBs || isMd)[1];
    const z = ents.find(x => x.name === p); if (!z) continue;
    let text = '';
    try { text = new TextDecoder().decode(ZR.read(zip, z)); } catch (e) { continue; }
    jsonChecked++;
    const refs = [...text.matchAll(/"(?:minecraft|([a-z0-9_.-]+))?:(?:block\/|item\/)?([a-z0-9_/.-]+?)"/g)];
    for (const rm of refs) {
      const rns = rm[1] || 'minecraft', rel = rm[2];
      if (!/^(block|item|entity|gui|particle|environment)\//.test(rel)) continue;
      const texPath = `assets/${rns}/textures/${rel}.png`;
      if (texSet.has(texPath)) continue;
      if (rns === 'minecraft') { if (isMd) { fallbackTex++; } else { fallbackModel++; } }
      else { R.refs.push({ ok: false, t: `${p} 引用 ${rns}:${rel} 但包内无此贴图` }); missingTex++; }
    }
  }
  R.refs.unshift({ ok: true, t: `检查了 ${jsonChecked} 个模型/方块状态 JSON` });
  if (fallbackModel) R.refs.push({ ok: true, soft: true, t: `${fallbackModel} 处引用原版模型(正常:回退原版)` });
  if (fallbackTex) R.refs.push({ ok: true, soft: true, t: `${fallbackTex} 处引用原版贴图(正常:回退原版)` });
  if (missingTex) { R.refs.push({ ok: false, t: `${missingTex} 处引用包内贴图但文件缺失(会紫黑格!)` }); R.warn += missingTex > 10 ? 2 : 1; }
  // ---- 3. 原版覆盖率 ----
  const vi = vanillaIndex();
  let covered = 0, total = 0;
  for (const [cat, set] of vi) {
    const hit = [...set].filter(p => paths.has(p)).length;
    covered += hit; total += set.size;
    if (set.size >= 20) R.cover.push({ cat, hit, size: set.size, pct: Math.round(hit / set.size * 100) });
  }
  R.cover.sort((a, b) => b.pct - a.pct);
  const pct = total ? Math.round(covered / total * 100) : 0;
  R.score = pct;
  const kind = pct >= 85 ? '全量材质包' : pct >= 25 ? '部分替换包' : '定向补丁包';
  R.cover.unshift({ cat: '总覆盖', hit: covered, size: total, pct, kind });
  // mod 命名空间
  const modNs = new Set([...paths].filter(p => /^assets\/(?!minecraft\/)/.test(p)).map(p => p.split('/')[1]));
  if (modNs.size) R.cover.push({ cat: 'mod 命名空间', note: `兼容 ${modNs.size} 个 mod:${[...modNs].slice(0, 6).join(', ')}${modNs.size > 6 ? '…' : ''}` });
  R.verdict = R.warn === 0 ? (pct >= 85 ? '✅ 完整的全量材质包' : `✅ 结构完整(${kind})`) : `⚠️ 发现 ${R.warn} 类问题`;
  return R;
}
function showCheckReport(R) {
  let ov = $('#checkOv');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'checkOv'; ov.className = 'overlay';
    ov.innerHTML = '<div id="checkBody" style="background:var(--card);border:1px solid var(--line2);border-radius:15px;padding:20px;width:min(640px,94vw);max-height:86vh;overflow-y:auto"></div>';
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) ov.classList.remove('show'); };
  }
  const row = (r, pre) => `<div style="font-size:12.5px;color:${r.ok === false ? 'var(--warn)' : r.soft ? 'var(--txt3)' : 'var(--acc)'}">${pre || (r.ok === false ? '✗' : r.ok ? '✓' : '·')} ${r.t || ''}</div>`;
  const cov = R.cover.map(c => `<span style="display:inline-block;margin:2px 4px;padding:2px 10px;border:1px solid var(--line);border-radius:9px;font-size:11.5px">${c.cat}${c.note ? ':' + c.note : ` ${c.hit}/${c.size}(${c.pct}%)`}</span>`).join('');
  $('#checkBody').innerHTML = `
    <h3 style="margin-bottom:4px">🔍 ${R.pack} · 完整性检测</h3>
    <div style="font-size:14px;margin-bottom:12px;color:${R.warn ? 'var(--warn)' : 'var(--acc)'}"><b>${R.verdict}</b></div>
    <div style="font-size:13px;color:var(--txt2);margin:8px 0 4px">① 结构</div>${R.struct.map(r => row(r)).join('')}
    <div style="font-size:13px;color:var(--txt2);margin:12px 0 4px">② 内部引用</div>${R.refs.map(r => row(r)).join('')}
    <div style="font-size:13px;color:var(--txt2);margin:12px 0 6px">③ 原版覆盖率(基准:Faithful 全量清单 ${VANILLA.count} 项)</div><div>${cov}</div>`;
  ov.classList.add('show');
}
