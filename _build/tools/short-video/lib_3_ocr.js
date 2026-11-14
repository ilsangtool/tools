/* ===== 사진 속 글자 읽기 (Tesseract, 이 기기 안에서) =====
   장면 글과 같은 낱말이 있는 곳을 찾아 그 부분을 가까이 보여 주는 데 씀 */
const VENDOR = new URL('../vendor/', location.href).href;
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const OCR_WORKER_SRC = `
let M = null, api = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.cmd === 'init') {
      importScripts(m.base + (m.simd ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'));
      M = await TesseractCore({ locateFile: (f) => m.base + f, TesseractProgress: (p) => self.postMessage({ type: 'prog', p }) });
      for (const lang of ['kor', 'eng']) {
        const r = await fetch(m.base + lang + '.traineddata');
        if (!r.ok) throw new Error('언어 자료를 받지 못했습니다');
        M.FS.writeFile('./' + lang + '.traineddata', new Uint8Array(await r.arrayBuffer()));
        self.postMessage({ type: 'load', lang });
      }
      api = new M.TessBaseAPI();
      if (api.Init(null, 'kor+eng', 1) === -1) throw new Error('글자 인식기를 시작하지 못했습니다');
      api.SetVariable('tessedit_pageseg_mode', '11'); // 화면 캡처는 글이 흩어져 있어 '흩어진 글' 방식
      api.SetVariable('preserve_interword_spaces', '0');
      self.postMessage({ type: 'ready' });
    } else if (m.cmd === 'ocr') {
      M.FS.writeFile('/input', new Uint8Array(m.png));
      if (api.SetImageFile(1, 0) === 1) throw new Error('그림을 읽지 못했습니다');
      api.Recognize(null);
      let tsv; try { tsv = api.GetTSVText(); } catch (_) { tsv = api.GetTSVText(0); }
      self.postMessage({ type: 'done', id: m.id, tsv });
    }
  } catch (err) { self.postMessage({ type: 'error', id: m.id, msg: String(err && err.message || err) }); }
};`;
class OCR {
  constructor(onProg){ this.onProg = onProg; this.w = null; this.ready = null; this.wait = {}; this.n = 0; }
  start(){
    if (this.ready) return this.ready;
    const url = URL.createObjectURL(new Blob([OCR_WORKER_SRC], { type: 'text/javascript' }));
    this.w = new Worker(url);
    this.ready = new Promise((ok, no) => {
      this.w.onmessage = e => {
        const m = e.data;
        if (m.type === 'ready') ok();
        else if (m.type === 'load') this.onProg && this.onProg({ stage: 'load', lang: m.lang });
        else if (m.type === 'prog') this.onProg && this.onProg({ stage: 'ocr', p: m.p });
        else if (m.type === 'done') { this.wait[m.id].ok(m.tsv); delete this.wait[m.id]; }
        else if (m.type === 'error') { if (m.id != null && this.wait[m.id]) { this.wait[m.id].no(new Error(m.msg)); delete this.wait[m.id]; } else no(new Error(m.msg)); }
      };
      this.w.onerror = e => no(new Error('글자 인식기를 불러오지 못했습니다'));
    });
    this.w.postMessage({ cmd: 'init', base: VENDOR + 'tesseract/', simd: WebAssembly.validate(SIMD_TEST) });
    return this.ready;
  }
  async recognize(png){
    await this.start();
    const id = ++this.n;
    return new Promise((ok, no) => { this.wait[id] = { ok, no }; this.w.postMessage({ cmd: 'ocr', id, png }, [png]); });
  }
  stop(){ if (this.w) this.w.terminate(); this.w = null; this.ready = null; }
}


let ocrBox = null;
async function readMediaText(m){
  if (m.type !== 'image') return [];
  const el = m.el, iw = el.naturalWidth, ih = el.naturalHeight; if (!iw) return [];
  const s = Math.min(1, 2400 / Math.max(iw, ih)), cv = document.createElement('canvas');
  cv.width = Math.round(iw * s); cv.height = Math.round(ih * s);
  const c = cv.getContext('2d', { willReadFrequently: true }); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(el, 0, 0, cv.width, cv.height);
  const src = c.getImageData(0, 0, cv.width, cv.height), lines = {};
  ocrBox = ocrBox || new OCR();
  // 두 번 읽음: 밝은 바탕의 옅은 글자(검색창 안내 글 등)는 진하게, 어두운 바탕의 흰 글자는 뒤집어서
  for (const inv of [false, true]) {
    const im = new ImageData(new Uint8ClampedArray(src.data), cv.width, cv.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { let v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; if (inv) v = 1 - v; v = Math.pow(v, 2.4) * 255; d[i] = d[i + 1] = d[i + 2] = v; }
    c.putImageData(im, 0, 0);
    const png = await (await new Promise(ok => cv.toBlob(ok, 'image/png'))).arrayBuffer();
    const tsv = await ocrBox.recognize(png);
    tsv.split('\n').forEach(row => {
      const f = row.split('\t'); if (f.length < 12 || f[0] !== '5') return;
      const txt = f[11].trim(), conf = +f[10]; if (!txt || conf < 30) return;
      const key = inv + '_' + f[2] + '_' + f[3] + '_' + f[4], L = +f[6], T = +f[7], W = +f[8], H = +f[9];
      const o = lines[key] || (lines[key] = { t: '', l: L, tp: T, r: L + W, b: T + H });
      o.t += (o.t ? ' ' : '') + txt; o.l = Math.min(o.l, L); o.tp = Math.min(o.tp, T); o.r = Math.max(o.r, L + W); o.b = Math.max(o.b, T + H);
    });
  }
  return Object.values(lines).map(o => ({ t: o.t, x: (o.l + o.r) / 2 / cv.width, y: (o.tp + o.b) / 2 / cv.height }));
}
const normT = s => String(s || '').replace(/[^가-힣A-Za-z0-9]/g, '');
function tokensOf(text){
  return String(text || '').split(/[\s·,./()]+/).map(w => normT(w).replace(/(으로|에서|까지|부터|이나|이랑|하고|을|를|이|가|은|는|의|에|로|와|과|도|만)$/, ''))
    .filter(w => w.length >= 2 && !/^(바로|한눈|꼭|지금|모두|함께|확인|하세요|합니다|드립니다)/.test(w));
}
/* 장면 글과 가장 잘 맞는 사진 속 줄 찾기. 같은 낱말 길이를 더하고, 두 글자 조각이 겹치면 조금 더함 */
function aimAt(text, media, avoid){
  const toks = tokensOf(text); if (!toks.length) return null;
  let best = null;
  media.forEach((m, k) => (m.lines || []).forEach(ln => {
    const lt = normT(ln.t); if (lt.length < 2) return;
    let sc = 0;
    toks.forEach(tk => {
      if (lt.includes(tk)) sc += tk.length;
      else for (let i = 0; i < tk.length - 1; i++) if (lt.includes(tk.slice(i, i + 2))) sc += 0.4;
    });
    if (avoid && avoid.some(a => a.k === k && Math.abs(a.fy - ln.y) < 0.08)) sc *= 0.6; // 앞 장면과 같은 자리는 덜
    if (sc > 0 && (!best || sc > best.score)) best = { k, fx: ln.x, fy: ln.y, score: sc, hit: ln.t };
  }));
  return best && best.score >= 1.5 ? best : null;
}
