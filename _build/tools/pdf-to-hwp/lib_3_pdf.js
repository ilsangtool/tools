/* ===== PDF 읽기(pdf.js) · 스캔 글자 인식(Tesseract) — 모두 이 기기 안에서 처리 ===== */
const VENDOR = new URL('../vendor/', location.href).href;
let pdfjsReady = null;
function loadPdfjs(){
  if (pdfjsReady) return pdfjsReady;
  pdfjsReady = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = VENDOR + 'pdfjs/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; no(new Error('PDF 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.')); };
    document.head.appendChild(s);
  });
  return pdfjsReady;
}

const BOLD_NAME = /bold|black|heavy|extrabold|semibold|demibold|[-_,]B$|[-_]Bd|굵은|견고딕|헤드라인|중고딕/i;
async function pageTextRuns(page, vp){
  const lib = window.pdfjsLib;
  const tc = await page.getTextContent();
  const runs = [];
  for (const it of tc.items) {
    if (!it.str || !it.transform) continue;
    const m = lib.Util.transform(vp.transform, it.transform);
    if (Math.abs(m[1]) > Math.abs(m[0]) * 0.5 + 0.01) continue; // 세로·회전 글자는 건너뜀
    const sz = Math.hypot(m[2], m[3]) || Math.abs(m[0]);
    if (sz < 1) continue;
    let bold = false;
    try { const f = page.commonObjs.get(it.fontName); bold = !!(f && (f.bold || f.black || BOLD_NAME.test(f.name || '') || BOLD_NAME.test(f.loadedName || ''))); } catch (_) {}
    const w = it.width * vp.scale;
    runs.push({ t: it.str.replace(/\u00a0/g, ' ').replace(/[\uE000-\uF8FF\uFFFD\u200B-\u200D\uFEFF]/g, ''), x1: m[4], x2: m[4] + w, yT: m[5] - sz * 0.88, yB: m[5] + sz * 0.18, sz, b: bold });
  }
  return runs;
}

function pageSegments(opList, vp){
  const lib = window.pdfjsLib, O = lib.OPS, U = lib.Util;
  const segs = [];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  let path = [];
  const dev = (x, y) => U.applyTransform([x, y], U.transform(vp.transform, ctm));
  const flushStroke = () => { path.forEach(s => segs.push(s)); path = []; };
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === O.transform) ctm = U.transform(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = U.transform(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === O.constructPath) {
      const ops = a[0], co = a[1]; let k = 0, cur = null, start = null;
      for (const op of ops) {
        if (op === O.rectangle) {
          const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; k += 4;
          const p = [dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)];
          const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
          const X1 = Math.min(...xs), X2 = Math.max(...xs), Y1 = Math.min(...ys), Y2 = Math.max(...ys);
          path.push({ rect: true, x1: X1, y1: Y1, x2: X2, y2: Y2 });
        } else if (op === O.moveTo) { cur = dev(co[k], co[k + 1]); start = cur; k += 2; }
        else if (op === O.lineTo) { const p = dev(co[k], co[k + 1]); k += 2; if (cur) path.push({ x1: cur[0], y1: cur[1], x2: p[0], y2: p[1] }); cur = p; }
        else if (op === O.curveTo) { const p = dev(co[k + 4], co[k + 5]); k += 6; cur = p; }
        else if (op === O.curveTo2 || op === O.curveTo3) { const p = dev(co[k + 2], co[k + 3]); k += 4; cur = p; }
        else if (op === O.closePath) { if (cur && start) path.push({ x1: cur[0], y1: cur[1], x2: start[0], y2: start[1] }); cur = start; }
      }
    } else if (fn === O.stroke || fn === O.closeStroke || fn === O.fillStroke || fn === O.eoFillStroke || fn === O.closeFillStroke || fn === O.closeEOFillStroke) {
      path.forEach(s => {
        if (s.rect) segs.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y1 }, { x1: s.x1, y1: s.y2, x2: s.x2, y2: s.y2 }, { x1: s.x1, y1: s.y1, x2: s.x1, y2: s.y2 }, { x1: s.x2, y1: s.y1, x2: s.x2, y2: s.y2 });
        else segs.push(s);
      });
      path = [];
    } else if (fn === O.fill || fn === O.eoFill) {
      // 가는 사각형을 채워 그린 선(한글·워드 PDF 표 테두리에 흔함)
      path.forEach(s => {
        if (!s.rect) return;
        const w = s.x2 - s.x1, h = s.y2 - s.y1;
        if (h <= 2.5 && w >= 3) segs.push({ x1: s.x1, y1: (s.y1 + s.y2) / 2, x2: s.x2, y2: (s.y1 + s.y2) / 2 });
        else if (w <= 2.5 && h >= 3) segs.push({ x1: (s.x1 + s.x2) / 2, y1: s.y1, x2: (s.x1 + s.x2) / 2, y2: s.y2 });
      });
      path = [];
    } else if (fn === O.endPath) path = [];
  }
  return segs;
}

function countImages(opList){
  const O = window.pdfjsLib.OPS;
  return opList.fnArray.filter(f => f === O.paintImageXObject || f === O.paintJpegXObject || f === O.paintInlineImageXObject || f === O.paintImageMaskXObject).length;
}

/* ---- 스캔 글자 인식 ---- */
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
      api.SetVariable('tessedit_pageseg_mode', '3');
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

async function renderPage(page, maxSide){
  const vp1 = page.getViewport({ scale: 1 });
  const s = Math.min(3, maxSide / Math.max(vp1.width, vp1.height));
  const vp = page.getViewport({ scale: s });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { cv, s };
}

/* 스캔 그림에서 표 선 찾기: 길게 이어진 어두운 픽셀 */
function imageSegments(cv, s){
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const dark = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) dark[j] = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < 140 ? 1 : 0;
  const minH = Math.max(60, w * 0.05), minV = Math.max(30, h * 0.015), maxThick = Math.max(5, Math.round(s * 2));
  // 한 방향으로 길게 이어진 어두운 줄을 찾고, 옆 줄과 겹쳐 두꺼우면(글자 획·색칠 막대) 버림
  function scan(len, cross, at, minLen){
    const rows = [];
    for (let a = 0; a < cross; a++) {
      const list = []; let run = 0, gap = 0;
      for (let b = 0; b <= len; b++) {
        const v = b < len && at(a, b);
        if (v) { run += 1 + gap; gap = 0; }
        else if (run && gap < 2) gap++;
        else { if (run >= minLen) list.push([b - gap - run, b - gap]); run = 0; gap = 0; }
      }
      rows.push(list);
    }
    const out = [], open = [];
    for (let a = 0; a <= cross; a++) {
      const list = a < cross ? rows[a] : [];
      for (let k = open.length - 1; k >= 0; k--) {
        const g = open[k], m = list.findIndex(r => Math.abs(r[0] - g.s) < 4 && Math.abs(r[1] - g.e) < 4 && !r.used);
        if (m >= 0) { list[m].used = true; g.n++; }
        else { open.splice(k, 1); if (g.n <= maxThick) out.push({ s: g.s, e: g.e, at: g.a + (g.n - 1) / 2 }); }
      }
      list.forEach(r => { if (!r.used) open.push({ s: r[0], e: r[1], a, n: 1 }); });
    }
    return out;
  }
  const segs = [];
  scan(w, h, (y, x) => dark[y * w + x], minH).forEach(g => segs.push({ x1: g.s / s, x2: g.e / s, y1: g.at / s, y2: g.at / s }));
  scan(h, w, (x, y) => dark[y * w + x], minV).forEach(g => segs.push({ x1: g.at / s, x2: g.at / s, y1: g.s / s, y2: g.e / s }));
  return segs;
}

/* 표 선을 지워 글자 인식이 칸 속 글자를 놓치지 않게 함 */
function eraseLines(cv, segs, s){
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff';
  for (const g of segs) {
    const x1 = Math.min(g.x1, g.x2) * s, x2 = Math.max(g.x1, g.x2) * s, y1 = Math.min(g.y1, g.y2) * s, y2 = Math.max(g.y1, g.y2) * s;
    const t = Math.max(5, s * 2.2); if (y2 - y1 < 1) ctx.fillRect(x1 - 1, y1 - t / 2, x2 - x1 + 2, t); else ctx.fillRect(x1 - t / 2, y1 - 1, t, y2 - y1 + 2);
  }
}
function tsvRuns(tsv, s){
  const runs = [], confs = [];
  for (const line of tsv.split('\n')) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const conf = +c[10], t = (c[11] || '').trim();
    if (!t || conf < 10 || /^[|ㅣl_—\-=]+$/.test(t)) continue;
    const L = +c[6] / s, T = +c[7] / s, W = +c[8] / s, H = +c[9] / s;
    confs.push(conf);
    runs.push({ t, x1: L, x2: L + W, yT: T, yB: T + H, sz: Math.max(6, H / 0.92), b: false, ocr: true, key: c[2] + '-' + c[3] + '-' + c[4] });
  }
  // 같은 줄 글자 크기 맞추기(단어마다 높이가 달라 생기는 흔들림 제거)
  const lines = groupLines(runs.map(r => ({ ...r })));
  for (const L of lines) {
    const sz = Math.round(median(L.runs.map(r => r.yB - r.yT)) / 0.92 * 2) / 2;
    L.runs.forEach(r => { const o = runs.find(x => x.x1 === r.x1 && x.yT === r.yT && x.t === r.t); if (o) o.sz = sz; });
  }
  return { runs, conf: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0 };
}
