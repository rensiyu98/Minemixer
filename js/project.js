'use strict';
/* MineMixer 工程文件：只保存来源与选择，不复制第三方材质文件。 */
const PROJECT_VERSION = 1;
function currentRecipe() {
  const used = new Set([...STATE.sel.values()].map(v => v.packId));
  const packs = STATE.packs.filter(p => used.has(p.id) || p.id === (localStorage.getItem('mm2_base') || '')).map(p => ({
    key: p.id, name: p.name, author: p.author, source: p.source, license: p.license,
    edition: p.edition || 'java', packFormat: p.packFormat,
  }));
  return {
    app: 'MineMixer', version: PROJECT_VERSION, createdAt: new Date().toISOString(),
    targetFormat: +($('#verSel2')?.value || 15), base: localStorage.getItem('mm2_base') || '', packs,
    selections: [...STATE.sel].map(([path, v]) => ({ path, pack: v.packId })),
  };
}
function downloadRecipe() {
  const recipe = currentRecipe();
  const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = 'MineMixer工程-' + new Date().toISOString().slice(0, 10) + '.mmx.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`💾 已保存工程：${recipe.selections.length} 项选择（不包含材质文件）`);
}
function packMatch(saved) {
  return STATE.packs.find(p => p.id === saved.key) || STATE.packs.find(p => p.name === saved.name && p.author === saved.author) || STATE.packs.find(p => p.name === saved.name);
}
async function applyRecipe(recipe) {
  if (!recipe || recipe.app !== 'MineMixer' || !Array.isArray(recipe.selections)) throw new Error('不是有效的 MineMixer 工程文件');
  const idMap = new Map(), missing = [];
  for (const saved of recipe.packs || []) {
    const local = packMatch(saved);
    if (local) idMap.set(saved.key, local.id); else missing.push(saved.name);
  }
  STATE.sel.clear();
  let restored = 0;
  for (const row of recipe.selections) {
    const pid = idMap.get(row.pack) || row.pack;
    const entry = (STATE.entriesByPack.get(pid) || []).find(e => e.path === row.path);
    if (entry) { STATE.sel.set(row.path, { packId: pid, entry }); restored++; }
  }
  if (recipe.targetFormat) { $('#verSel2').value = String(recipe.targetFormat); localStorage.setItem('mm2_ver', String(recipe.targetFormat)); }
  const base = idMap.get(recipe.base) || '';
  localStorage.setItem('mm2_base', base); saveSel(); renderWorkbench(); renderCenter();
  toast(`📂 已恢复 ${restored}/${recipe.selections.length} 项${missing.length ? `；请先导入缺少的包：${missing.slice(0, 3).join('、')}` : ''}`, missing.length > 0);
}
function encodeRecipe(recipe) { return btoa(unescape(encodeURIComponent(JSON.stringify(recipe)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decodeRecipe(raw) { const s = raw.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4))))); }
async function shareRecipe() {
  const recipe = currentRecipe(), encoded = encodeRecipe(recipe);
  const url = location.origin + location.pathname + '#mix=' + encoded;
  if (url.length > 6500) { downloadRecipe(); toast('配方较大，已改为工程文件；把文件和原材质包来源一起分享', true); return; }
  try { await navigator.clipboard.writeText(url); toast('🔗 分享链接已复制；对方仍需导入相同的原材质包'); }
  catch (_) { prompt('复制这个分享链接：', url); }
}
function initProjectTools() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.mmx'; input.hidden = true; document.body.appendChild(input);
  $('#btnProjectSave').onclick = downloadRecipe;
  $('#btnProjectOpen').onclick = () => input.click();
  $('#btnProjectShare').onclick = shareRecipe;
  input.onchange = async () => { const f = input.files[0]; input.value = ''; if (!f) return; try { await applyRecipe(JSON.parse(await f.text())); } catch (e) { toast('恢复失败：' + e.message, true); } };
  if (location.hash.startsWith('#mix=')) {
    try { setTimeout(() => applyRecipe(decodeRecipe(location.hash.slice(5))), 0); }
    catch (e) { toast('分享链接损坏：' + e.message, true); }
  }
}
