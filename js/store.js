'use strict';
/* ============ IndexedDB 存储 ============ */
const DB = {
  db: null,
  open() {
    return new Promise((ok, no) => {
      const rq = indexedDB.open('minemixer_v2', 1);
      rq.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('entries')) {
          const s = db.createObjectStore('entries', { keyPath: 'id' });
          s.createIndex('packId', 'packId'); s.createIndex('path', 'path'); s.createIndex('cat', 'cat');
        }
      };
      rq.onsuccess = () => { DB.db = rq.result; ok(DB.db); };
      rq.onerror = () => no(rq.error);
    });
  },
  tx(stores, mode) { return DB.db.transaction(stores, mode); },
  req(r) { return new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async putPack(pack, zipBuf, entries) {
    // packs 记录直接带 zip 二进制(便于懒加载缩略图与导出)
    await DB.req(DB.tx(['packs'], 'readwrite').objectStore('packs').put({ ...pack, zip: zipBuf }));
    const st = DB.tx(['entries'], 'readwrite').objectStore('entries');
    const puts = entries.map(e => DB.req(st.put({ ...e, id: pack.id + '|' + e.path, packId: pack.id })));
    await Promise.all(puts);
  },
  async packs() {
    const all = await DB.req(DB.tx(['packs']).objectStore('packs').getAll());
    return all.map(p => ({ ...p, zip: undefined, size: p.zip ? p.zip.byteLength : 0 })).sort((a, b) => b.importedAt - a.importedAt);
  },
  async packZip(id) {
    const p = await DB.req(DB.tx(['packs']).objectStore('packs').get(id));
    return p ? p.zip : null;
  },
  async entriesOf(packId) {
    return new Promise((ok, no) => {
      const idx = DB.tx(['entries']).objectStore('entries').index('packId');
      const rq = idx.getAll(packId); rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error);
    });
  },
  async byPath(path) {
    return new Promise((ok, no) => {
      const idx = DB.tx(['entries']).objectStore('entries').index('path');
      const rq = idx.getAll(path); rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error);
    });
  },
  async patchPack(id, patch) {
    const p = await DB.req(DB.tx(['packs']).objectStore('packs').get(id));
    if (!p) return;
    await DB.req(DB.tx(['packs'], 'readwrite').objectStore('packs').put({ ...p, ...patch }));
  },
  async delPack(id) {
    await DB.req(DB.tx(['packs'], 'readwrite').objectStore('packs').delete(id));
    await new Promise((ok) => {
      const st = DB.tx(['entries'], 'readwrite').objectStore('entries');
      const idx = st.index('packId'); const rq = idx.openCursor(id);
      rq.onsuccess = () => { const c = rq.result; if (c) { c.delete(); c.continue(); } else ok(); };
    });
  },
};
