let items = [], busy = false, nextRun = false;
const kb = b => b >= 1048576 ? (b / 1048576).toFixed(2) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
const isHeic = f => /\.(heic|heif)$/i.test(f.name) || /hei[cf]/i.test(f.type);
const EXT = { jpeg:'jpg', webp:'webp', png:'png' };

let heicLib = null;
function loadHeic(){
  if (heicLib) return heicLib;
  heicLib = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload = () => ok(window.heic2any); s.onerror = () => { heicLib = null; no(new Error('HEIC 변환 도구를 불러오지 못했습니다 (인터넷 연결 확인)')); };
    document.head.appendChild(s);
  });
  return heicLib;
}
function viaImg(blob){
  return new Promise((ok, no) => { const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('이 브라우저가 읽을 수 없는 형식입니다')); }; im.src = u; });
}
async function decode(file){
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {}
  try { return await viaImg(file); } catch (e) { if (!isHeic(file)) throw e; }
  const h2a = await loadHeic();
  let out = await h2a({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  if (Array.isArray(out)) out = out[0];
  return await createImageBitmap(out).catch(() => viaImg(out));
}
const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, 'image/' + type, q));
async function encode(src, maxW, fmt, q, target){
  const sw = src.width, sh = src.height;
  let scale = maxW && Math.max(sw, sh) > maxW ? maxW / Math.max(sw, sh) : 1;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const render = s => {
    c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
    if (fmt !== 'png') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
  };
  render(scale);
  if (!target) return { blob: await toBlob(c, fmt, q), w: c.width, h: c.height };
  const T = target * 1024;
  for (let round = 0; round < 8; round++) {
    if (fmt === 'png') { const b = await toBlob(c, fmt); if (b.size <= T) return { blob: b, w: c.width, h: c.height }; }
    else {
      let lo = 0.3, hi = Math.min(q, 0.95), best = null;
      const top = await toBlob(c, fmt, hi); if (top.size <= T) return { blob: top, w: c.width, h: c.height };
      for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2, b = await toBlob(c, fmt, mid); if (b.size <= T) { best = b; lo = mid; } else hi = mid; }
      if (best) return { blob: best, w: c.width, h: c.height };
    }
    scale *= 0.8; render(scale);
  }
  return { blob: await toBlob(c, fmt, 0.3), w: c.width, h: c.height, over: true };
}

function render(){
  $('#listCard').classList.toggle('hidden', !items.length);
  $('#run').disabled = !items.length; $('#clear').disabled = !items.length;
  $('#zip').disabled = !items.some(i => i.out);
  $('#list').innerHTML = items.map((it, k) => `<li>
    <img alt="" src="${it.url || it.thumb || ''}">
    <div><div class="nm">${esc(it.outName || it.file.name)}</div>
      <div class="meta">원본 ${kb(it.file.size)}${it.w0 ? ` · ${it.w0}×${it.h0}` : ''}${it.out ? ` → <b>${kb(it.out.size)}</b> · ${it.w}×${it.h} (${Math.round((1 - it.out.size / it.file.size) * 100)}% 줄임)` : ''}
      ${it.status ? `<span class="${it.err ? 'err' : ''}">${it.status}</span>` : ''}</div></div>
    <button type="button" class="ghost sm" data-dl="${k}" ${it.out ? '' : 'disabled'}>저장</button></li>`).join('');
  const done = items.filter(i => i.out), a = done.reduce((s, i) => s + i.file.size, 0), b = done.reduce((s, i) => s + i.out.size, 0);
  $('#sum').textContent = done.length ? `${done.length}장 완료 · ${kb(a)} → ${kb(b)} (${Math.round((1 - b / a) * 100)}% 줄임)` : '';
}

async function run(){
  if (busy) { nextRun = true; return; }
  busy = true;
  const maxW = +$('#maxW').value, fmt = $('#fmt').value, q = +$('#q').value / 100, target = +$('#target').value;
  for (const it of items) {
    try {
      it.status = isHeic(it.file) && !it.src ? ' · HEIC 변환 중…' : ' · 처리 중…'; it.err = false; render();
      if (!it.src) { it.src = await decode(it.file); it.w0 = it.src.width; it.h0 = it.src.height; }
      const r = await encode(it.src, maxW, fmt, q, target);
      if (it.url) URL.revokeObjectURL(it.url);
      it.out = r.blob; it.w = r.w; it.h = r.h; it.url = URL.createObjectURL(r.blob);
      it.outName = it.file.name.replace(/\.[^.]+$/, '') + '.' + EXT[fmt];
      it.status = r.over ? ' · 목표 용량까지 못 줄였습니다' : ''; it.err = !!r.over;
    } catch (e) { it.status = ' · ' + e.message; it.err = true; }
    render();
  }
  busy = false;
  if (nextRun) { nextRun = false; run(); }
}

function addFiles(list){
  const fs = Array.from(list).filter(f => f.type.startsWith('image/') || isHeic(f));
  if (!fs.length) { toast('사진 파일만 넣을 수 있습니다'); return; }
  fs.forEach(f => items.push({ file: f, thumb: isHeic(f) ? '' : URL.createObjectURL(f) }));
  render(); run();
}

// ZIP (무압축) — 외부 라이브러리 없이 저장
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function makeZip(files){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const used = {};
  for (const f of files) {
    let name = f.name; if (used[name]) { name = name.replace(/(\.[^.]+)$/, `_${used[name]}$1`); } used[f.name] = (used[f.name] || 0) + 1;
    const data = new Uint8Array(await f.blob.arrayBuffer()), nb = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(lh.buffer, nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((s, p) => s + (p.byteLength || p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

const drop = $('#drop');
$('#file').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
document.addEventListener('paste', e => { const fs = Array.from(e.clipboardData.files || []); if (fs.length) addFiles(fs); });
$('#q').addEventListener('input', () => $('#qv').textContent = $('#q').value);
let t; ['maxW', 'fmt', 'target', 'q'].forEach(id => $('#' + id).addEventListener('change', () => {
  $('#qWrap').style.opacity = $('#fmt').value === 'png' ? .4 : 1;
  store.set('ilsang_imgresize_v1', { maxW: $('#maxW').value, fmt: $('#fmt').value, target: $('#target').value, q: $('#q').value });
  clearTimeout(t); if (items.length) t = setTimeout(run, 150);
}));
$('#run').addEventListener('click', run);
$('#list').addEventListener('click', e => { const k = e.target.dataset.dl; if (k != null && items[k].out) download(items[k].out, items[k].outName); });
$('#zip').addEventListener('click', async () => {
  const done = items.filter(i => i.out); if (!done.length) return;
  if (done.length === 1) { download(done[0].out, done[0].outName); return; }
  toast('ZIP 만드는 중…');
  download(await makeZip(done.map(i => ({ name: i.outName, blob: i.out }))), '사진_용량줄이기.zip');
});
$('#clear').addEventListener('click', () => { items.forEach(i => { if (i.url) URL.revokeObjectURL(i.url); if (i.thumb) URL.revokeObjectURL(i.thumb); }); items = []; render(); });
const st = store.get('ilsang_imgresize_v1');
if (st) { ['maxW', 'fmt', 'target', 'q'].forEach(id => { if (st[id] != null) $('#' + id).value = st[id]; }); $('#qv').textContent = $('#q').value; }
render();
