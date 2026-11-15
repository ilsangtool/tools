const KEY = 'ilsang_pdf2hwp_v1';
let pdf = null, fileName = '', result = null, busy = false, stopFlag = false, ocr = null;

const OPT_IDS = ['optTables', 'optStrip', 'optBreak', 'optOcr', 'optRange'];
function opts(){
  return { tables: $('#optTables').checked, strip: $('#optStrip').checked, pagebreak: $('#optBreak').checked, ocr: $('#optOcr').value, range: val('optRange') };
}
function saveOpts(){ const o = opts(); delete o.range; store.set(KEY, o); }
(() => { const o = store.get(KEY); if (!o) return; $('#optTables').checked = o.tables !== false; $('#optStrip').checked = o.strip !== false; $('#optBreak').checked = !!o.pagebreak; if (o.ocr) $('#optOcr').value = o.ocr; })();
OPT_IDS.forEach(id => $('#' + id).addEventListener('change', saveOpts));

function setStatus(msg, pct){
  $('#status').textContent = msg || '';
  $('#bar').style.width = (pct == null ? 0 : Math.max(2, Math.min(100, pct))) + '%';
  $('#progress').classList.toggle('hidden', pct == null && !msg);
}
function parseRange(s, n){
  if (!s.trim()) return Array.from({ length: n }, (_, i) => i + 1);
  const set = new Set();
  s.split(/[,\s]+/).filter(Boolean).forEach(p => {
    const m = p.match(/^(\d+)(?:[-~](\d+))?$/); if (!m) return;
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(n, b); i++) set.add(i);
  });
  return [...set].sort((x, y) => x - y);
}
const pwWait = () => new Promise(ok => {
  $('#pwBox').classList.remove('hidden'); $('#pw').value = ''; $('#pw').focus();
  const go = () => { $('#pwBox').classList.add('hidden'); $('#pwGo').removeEventListener('click', go); ok($('#pw').value); };
  $('#pwGo').addEventListener('click', go);
  $('#pw').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
});

async function openFile(f){
  if (!f) return;
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast('PDF 파일만 넣을 수 있습니다'); return; }
  if (busy) return;
  resetResult();
  fileName = f.name.replace(/\.pdf$/i, '');
  $('#fileInfo').textContent = '불러오는 중…';
  $('#fileCard').classList.remove('hidden');
  try {
    const lib = await loadPdfjs();
    const data = new Uint8Array(await f.arrayBuffer());
    const task = lib.getDocument({ data, cMapUrl: VENDOR + 'pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: VENDOR + 'pdfjs/standard_fonts/', isEvalSupported: false });
    task.onPassword = async (cb, reason) => { $('#pwMsg').textContent = reason === 2 ? '비밀번호가 틀렸습니다. 다시 입력하세요.' : '비밀번호가 걸린 PDF입니다.'; cb(await pwWait()); };
    if (pdf) pdf.destroy();
    pdf = await task.promise;
    $('#fileInfo').innerHTML = `<b>${esc(f.name)}</b> · ${pdf.numPages}쪽 · ${mb(f.size)}`;
    $('#optRange').placeholder = `전체 (1-${pdf.numPages})`;
    $('#convert').disabled = false;
    $('#convert').focus();
  } catch (e) {
    pdf = null; $('#convert').disabled = true;
    $('#fileInfo').textContent = /Invalid PDF|InvalidPDF/i.test(String(e)) ? '손상됐거나 PDF가 아닌 파일입니다.' : ('열 수 없습니다: ' + (e.message || e));
  }
}

function resetResult(){ result = null; $('#resultCard').classList.add('hidden'); setStatus('', null); }

async function convert(){
  if (!pdf || busy) return;
  busy = true; stopFlag = false;
  $('#convert').disabled = true; $('#stop').classList.remove('hidden');
  resetResult();
  const o = opts(), list = parseRange(o.range, pdf.numPages);
  if (!list.length) { toast('페이지 범위를 확인해 주세요'); busy = false; $('#convert').disabled = false; $('#stop').classList.add('hidden'); return; }
  const pages = [];
  let ocrPages = 0, confSum = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      if (stopFlag) throw new Error('STOP');
      const n = list[i], base = i / list.length * 100;
      setStatus(`${n}쪽 읽는 중 (${i + 1}/${list.length})`, base);
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const opList = await page.getOperatorList();
      let runs = await pageTextRuns(page, vp), segs = pageSegments(opList, vp);
      const chars = runs.reduce((a, r) => a + r.t.replace(/\s/g, '').length, 0);
      const needOcr = o.ocr === 'always' || (o.ocr === 'auto' && chars < 15 && countImages(opList) > 0);
      let kind = chars ? 'text' : 'empty', conf = 0;
      if (needOcr) {
        if (!ocr) ocr = new OCR(p => {
          if (p.stage === 'load') setStatus(`글자 인식기 준비 중 (${p.lang === 'kor' ? '한국어' : '영어'} 자료 받음)…`, base);
          else setStatus(`${n}쪽 스캔 글자 인식 중 ${Math.round(p.p)}% (${i + 1}/${list.length})`, base + (100 / list.length) * Math.min(1, p.p / 100));
        });
        setStatus(ocr.ready ? `${n}쪽 스캔 글자 인식 준비` : '처음 한 번 글자 인식기를 받는 중입니다 (약 7MB)…', base);
        const { cv, s } = await renderPage(page, 3200);
        const lineSegs = imageSegments(cv, s);
        eraseLines(cv, lineSegs, s);
        const png = await new Promise(ok => cv.toBlob(b => b.arrayBuffer().then(ok), 'image/png'));
        const tsv = await ocr.recognize(png);
        const r = tsvRuns(tsv, s);
        runs = r.runs; conf = r.conf; segs = o.tables ? lineSegs : [];
        kind = 'ocr'; ocrPages++; confSum += conf;
      }
      const layout = layoutPage(runs, segs, { W: vp.width, H: vp.height }, o);
      pages.push({ n, W: vp.width, H: vp.height, layout, kind, conf });
      page.cleanup();
      await new Promise(r => setTimeout(r));
    }
    setStatus('문서로 정리하는 중…', 99);
    const removed = o.strip ? stripRepeats(pages) : 0;
    const allSz = [];
    pages.forEach(p => p.layout.lines.forEach(l => { for (let k = 0; k < Math.min(40, l.text.length); k++) allSz.push(l.sz); }));
    const bodySz = median(allSz) || 10;
    const blocks = [];
    pages.forEach((p, i) => {
      const bl = finishPage(p.layout, p, o, bodySz);
      if (o.pagebreak && i > 0 && bl.length) bl[0].pb = true;
      blocks.push(...bl);
    });
    result = { blocks, pages, removed, ocrPages, conf: ocrPages ? confSum / ocrPages : 0 };
    showResult();
    setStatus('', null);
  } catch (e) {
    if (e.message === 'STOP') setStatus('변환을 멈췄습니다.', null);
    else { console.error(e); setStatus('변환 중 문제가 생겼습니다: ' + (e.message || e), null); }
  } finally {
    busy = false; $('#convert').disabled = !pdf; $('#stop').classList.add('hidden');
  }
}

function showResult(){
  const r = result, tables = r.blocks.filter(b => b.type === 'table').length, paras = r.blocks.filter(b => b.type === 'p' && !b.blank).length;
  const chars = docPlainText(r.blocks).replace(/\s/g, '').length;
  const empty = r.pages.filter(p => p.kind === 'empty').length;
  $('#stats').innerHTML =
    `<div><small>변환한 쪽</small><b>${r.pages.length}쪽</b></div>` +
    `<div><small>문단</small><b>${paras.toLocaleString()}개</b></div>` +
    `<div><small>표</small><b>${tables}개</b></div>` +
    `<div><small>글자 수</small><b>${chars.toLocaleString()}자</b></div>`;
  const notes = [];
  if (r.ocrPages) notes.push(`스캔 쪽 ${r.ocrPages}개는 글자 인식으로 변환했습니다 (평균 정확도 ${Math.round(r.conf)}%). 숫자·이름은 원본과 꼭 대조해 주세요.`);
  if (empty) notes.push(`글자가 없는 쪽 ${empty}개는 비어 있습니다. 스캔본이면 '스캔 글자 인식'을 '항상'으로 바꿔 다시 변환하세요.`);
  if (r.removed) notes.push(`머리말·꼬리말·쪽번호 ${r.removed}줄을 뺐습니다.`);
  if (!chars) notes.push('읽을 수 있는 글자가 없습니다. 그림으로만 된 PDF라면 스캔 글자 인식을 켜 주세요.');
  $('#notes').innerHTML = notes.map(t => `<li>${esc(t)}</li>`).join('');
  $('#notes').classList.toggle('hidden', !notes.length);
  $('#resultCard').classList.remove('hidden');
  $('#preview').innerHTML = previewHtml(r.blocks);
  $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function previewHtml(blocks){
  const k = Math.min(1.33, Math.max(0.9, ($('#preview').clientWidth || 600) / 520)); // 화면 폭에 맞춘 미리보기 배율
  const pHtml = p => {
    const st = [`text-align:${{ J: 'justify', L: 'left', C: 'center', R: 'right' }[p.align || 'J']}`];
    if (p.ml) st.push(`padding-left:${(p.ml * k).toFixed(0)}px`);
    if (p.fi) st.push(`text-indent:${(p.fi * k).toFixed(0)}px`);
    return `<p style="${st.join(';')}">${p.runs.map(r => `<span style="font-size:${(r.sz * k).toFixed(1)}px${r.b ? ';font-weight:700' : ''}">${esc(r.t)}</span>`).join('') || '&nbsp;'}</p>`;
  };
  let h = '';
  for (const b of blocks) {
    if (b.pb) h += '<hr class="pg">';
    if (b.type === 'p') { h += pHtml(b); continue; }
    const tot = b.cols.reduce((a, c) => a + c, 0);
    h += `<div class="tw"><table><colgroup>${b.cols.map(c => `<col style="width:${(c / tot * 100).toFixed(2)}%">`).join('')}</colgroup>`;
    b.rows.forEach((_, r) => {
      h += '<tr>' + b.cells.filter(c => c.r === r).sort((x, y) => x.c - y.c).map(c => `<td${c.rs > 1 ? ` rowspan="${c.rs}"` : ''}${c.cs > 1 ? ` colspan="${c.cs}"` : ''}>${c.paras.map(pHtml).join('')}</td>`).join('') + '</tr>';
    });
    h += '</table></div>';
  }
  return h || '<p class="hint">변환된 내용이 없습니다.</p>';
}

/* ---- 이벤트 ---- */
const drop = $('#drop');
$('#file').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => openFile(e.dataTransfer.files[0]));
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
$('#convert').addEventListener('click', convert);
$('#stop').addEventListener('click', () => { stopFlag = true; if (ocr) { ocr.stop(); ocr = null; } setStatus('멈추는 중…', 0); });
$('#saveHwpx').addEventListener('click', () => result && download(makeHwpx(result.blocks, fileName), fileName + '.hwpx'));
$('#saveDocx').addEventListener('click', () => result && download(makeDocx(result.blocks, fileName), fileName + '.docx'));
$('#saveTxt').addEventListener('click', () => result && download(new Blob(['﻿' + docPlainText(result.blocks)], { type: 'text/plain;charset=utf-8' }), fileName + '.txt'));
$('#copyTxt').addEventListener('click', () => result && copy(docPlainText(result.blocks)));

/* =========================================================
   PDF 나누기·합치기 (pdf-lib, 이 기기 안에서)
   ========================================================= */
bindTabs($('#modes'));
let pdfLibP = null;
function loadPdfLib(){
  return pdfLibP || (pdfLibP = new Promise((ok, no) => {
    if (window.PDFLib) return ok(window.PDFLib);
    const s = document.createElement('script'); s.src = VENDOR + 'pdf-lib/pdf-lib.min.js';
    s.onload = () => ok(window.PDFLib); s.onerror = () => { pdfLibP = null; no(new Error('PDF 도구를 불러오지 못했습니다')); };
    document.head.appendChild(s);
  }));
}
// 적은 순서 그대로 (같은 쪽을 두 번 적어도 그대로)
function parseOrder(s, n){
  const out = [];
  String(s || '').split(/[,\s]+/).filter(Boolean).forEach(p => {
    const m = p.match(/^(\d+)(?:[-~](\d+))?$/); if (!m) return;
    const a = +m[1], b = m[2] ? +m[2] : a, step = a <= b ? 1 : -1;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) if (i >= 1 && i <= n) out.push(i);
  });
  return out;
}
const isPdf = f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
const mb = b => b < 102400 ? Math.max(1, Math.round(b / 1024)) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
const pagesLabel = list => { // [1,2,3,5] → "1-3, 5"
  const out = []; let a = list[0], prev = list[0];
  for (let i = 1; i <= list.length; i++) { const c = list[i]; if (c === prev + 1) { prev = c; continue; } out.push(a === prev ? `${a}` : `${a}-${prev}`); a = prev = c; }
  return out.join(', ');
};
async function loadForEdit(f){
  const L = await loadPdfLib(), bytes = new Uint8Array(await f.arrayBuffer());
  let doc;
  try { doc = await PdfUnlock.load(L, bytes, t => askPw(f.name, t)); }
  catch (e) { console.error(e); throw new Error(e.message === 'UNSUPPORTED' ? '표준이 아닌 보안 방식(인증서·DRM)이라 풀 수 없습니다' : '손상됐거나 PDF가 아닌 파일입니다'); }
  if (!doc) throw new Error('암호를 넣지 않아 열지 않았습니다');
  return doc;
}
/* 여는 암호 묻기 (틀리면 다시) */
function askPw(name, tries){
  return new Promise(ok => {
    const box = $('#pwAsk'), inp = $('#pwAskIn');
    $('#pwAskMsg').textContent = tries ? '암호가 맞지 않습니다. 다시 넣어 주세요.' : `${name} 은(는) 여는 암호가 걸려 있습니다.`;
    inp.value = ''; box.classList.remove('hidden'); setTimeout(() => inp.focus(), 50);
    const done = v => { box.classList.add('hidden'); $('#pwAskOk').onclick = $('#pwAskNo').onclick = inp.onkeydown = null; ok(v); };
    $('#pwAskOk').onclick = () => done(inp.value);
    $('#pwAskNo').onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
  });
}
async function buildPdf(parts){ // parts: [[doc, [쪽번호…]]]
  const { PDFDocument } = await loadPdfLib(), out = await PDFDocument.create();
  for (const [doc, list] of parts) (await out.copyPages(doc, list.map(n => n - 1))).forEach(p => out.addPage(p));
  return out.save();
}

/* ---- 나누기 ---- */
let sDoc = null, sName = '', sResults = [];
async function sOpen(f){
  if (!f) return; if (!isPdf(f)) { toast('PDF 파일만 넣을 수 있습니다'); return; }
  $('#sCard').classList.remove('hidden'); $('#sOut').classList.add('hidden'); $('#sInfo').textContent = '불러오는 중…'; $('#sGo').disabled = true;
  try {
    sDoc = await loadForEdit(f); sName = f.name.replace(/\.pdf$/i, '');
    $('#sInfo').innerHTML = `<b>${esc(f.name)}</b> · ${sDoc.getPageCount()}쪽 · ${mb(f.size)}` + (sDoc.unlocked ? ' · <b>보안을 풀었습니다</b> (나눈 파일에는 보안이 없습니다)' : '');
    $('#sGo').disabled = false; sPlan();
  } catch (e) { sDoc = null; $('#sInfo').textContent = e.message; }
}
function sGroups(){
  if (!sDoc) return [];
  const n = sDoc.getPageCount(), way = radio('sway');
  if (way === 'each') return Array.from({ length: n }, (_, i) => [i + 1]);
  if (way === 'every') { const k = Math.max(1, Math.floor(+val('sEvery') || 1)), g = []; for (let i = 1; i <= n; i += k) g.push(Array.from({ length: Math.min(k, n - i + 1) }, (_, j) => i + j)); return g; }
  if (way === 'ranges') return val('sRanges').split(',').map(p => parseOrder(p, n)).filter(g => g.length);
  const g = parseOrder(val('sPick'), n); return g.length ? [g] : [];
}
function sPlan(){
  const way = radio('sway');
  $('#sRangesBox').classList.toggle('hidden', way !== 'ranges'); $('#sEveryBox').classList.toggle('hidden', way !== 'every'); $('#sPickBox').classList.toggle('hidden', way !== 'pick');
  if (!sDoc) return;
  const g = sGroups();
  $('#sPlan').textContent = !g.length ? '쪽 번호를 적어 주세요.' : `PDF ${g.length}개가 만들어집니다: ` + g.slice(0, 6).map(x => pagesLabel(x) + '쪽').join(' / ') + (g.length > 6 ? ` 외 ${g.length - 6}개` : '');
  $('#sGo').disabled = !g.length;
}
$('#sWay').addEventListener('change', sPlan); ['sRanges', 'sEvery', 'sPick'].forEach(id => $('#' + id).addEventListener('input', sPlan));
$('#sGo').addEventListener('click', async () => {
  const g = sGroups(); if (!g.length) return;
  const btn = $('#sGo'); btn.disabled = true; sResults = [];
  try {
    for (let i = 0; i < g.length; i++) {
      btn.textContent = `나누는 중 ${i + 1}/${g.length}`;
      const bytes = await buildPdf([[sDoc, g[i]]]);
      sResults.push({ name: `${sName}_${pagesLabel(g[i]).replace(/, /g, '_')}쪽.pdf`, bytes, pages: g[i].length });
      await new Promise(r => setTimeout(r));
    }
    $('#sOutInfo').textContent = `PDF ${sResults.length}개를 만들었습니다 (합계 ${mb(sResults.reduce((a, r) => a + r.bytes.length, 0))}).`;
    $('#sList').innerHTML = sResults.map((r, i) => `<li><span class="nm">${esc(r.name)}<small>${r.pages}쪽 · ${mb(r.bytes.length)}</small></span><button type="button" class="ghost" data-i="${i}">받기</button></li>`).join('');
    $('#sZip').classList.toggle('hidden', sResults.length < 2);
    $('#sOut').classList.remove('hidden'); $('#sOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.error(e); toast('나누는 중 문제가 생겼습니다: ' + (e.message || e)); }
  btn.textContent = '나누기'; btn.disabled = false;
});
$('#sList').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const r = sResults[+b.dataset.i]; download(new Blob([r.bytes], { type: 'application/pdf' }), r.name); });
$('#sZip').addEventListener('click', () => sResults.length && download(zipStore(sResults.map(r => [r.name, r.bytes]), 'application/zip'), sName + '_나눔.zip'));
$('#sFile').addEventListener('change', e => { sOpen(e.target.files[0]); e.target.value = ''; });

/* ---- 합치기 ---- */
const mFiles = [];
async function mAdd(files){
  const list = [...files].filter(isPdf); if (!list.length) { toast('PDF 파일만 넣을 수 있습니다'); return; }
  $('#mCard').classList.remove('hidden');
  for (const f of list) {
    try { const doc = await loadForEdit(f); mFiles.push({ name: f.name, size: f.size, doc, n: doc.getPageCount(), range: '', unlocked: doc.unlocked }); }
    catch (e) { toast(`${f.name}: ${e.message}`); }
  }
  mRender();
}
function mRender(){
  $('#mList').innerHTML = mFiles.map((m, i) => `<li><b>${i + 1}</b><span class="nm">${esc(m.name)}<small>${m.n}쪽 · ${mb(m.size)}${m.unlocked ? ' · 보안 풂' : ''}</small></span>
    <input type="text" data-i="${i}" value="${esc(m.range)}" placeholder="전체" aria-label="${i + 1}번 파일에서 넣을 쪽" inputmode="numeric">
    <button type="button" class="ghost" data-a="up" data-i="${i}" aria-label="위로" ${i ? '' : 'disabled'}>위</button><button type="button" class="ghost" data-a="dn" data-i="${i}" aria-label="아래로" ${i < mFiles.length - 1 ? '' : 'disabled'}>아래</button><button type="button" class="ghost" data-a="del" data-i="${i}">빼기</button></li>`).join('');
  mInfo();
  $('#mCard').classList.toggle('hidden', !mFiles.length);
}
function mPages(m){ return m.range.trim() ? parseOrder(m.range, m.n) : Array.from({ length: m.n }, (_, i) => i + 1); }
function mInfo(){
  const tot = mFiles.reduce((a, m) => a + mPages(m).length, 0), bad = mFiles.filter(m => m.range.trim() && !mPages(m).length).length;
  $('#mInfo').textContent = mFiles.length < 2 ? 'PDF를 2개 이상 넣어 주세요. (1개만 넣으면 고른 쪽만 뽑아 새 파일로 만듭니다)' : `PDF ${mFiles.length}개, 모두 ${tot}쪽을 합칩니다.` + (bad ? ` 쪽 번호가 맞지 않는 파일 ${bad}개는 빠집니다.` : '');
  $('#mGo').disabled = !tot;
}
$('#mList').addEventListener('input', e => { if (e.target.dataset.i != null) { mFiles[+e.target.dataset.i].range = e.target.value; mInfo(); } });
$('#mList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i;
  if (b.dataset.a === 'del') mFiles.splice(i, 1);
  else { const j = b.dataset.a === 'up' ? i - 1 : i + 1; [mFiles[i], mFiles[j]] = [mFiles[j], mFiles[i]]; }
  mRender();
});
$('#mGo').addEventListener('click', async () => {
  const parts = mFiles.map(m => [m.doc, mPages(m)]).filter(p => p[1].length); if (!parts.length) return;
  const btn = $('#mGo'); btn.disabled = true; btn.textContent = '합치는 중…';
  try {
    const bytes = await buildPdf(parts), name = (val('mName').trim() || '합친문서').replace(/[\\/:*?"<>|]/g, '_');
    download(new Blob([bytes], { type: 'application/pdf' }), name + '.pdf');
    toast(`${parts.reduce((a, p) => a + p[1].length, 0)}쪽 PDF를 저장했습니다 (${mb(bytes.length)})`);
  } catch (e) { console.error(e); toast('합치는 중 문제가 생겼습니다: ' + (e.message || e)); }
  btn.textContent = '합치기'; btn.disabled = false;
});
$('#mClear').addEventListener('click', () => { mFiles.length = 0; mRender(); });
$('#mFile').addEventListener('change', e => { mAdd(e.target.files); e.target.value = ''; });
[['sDrop', 'sFile', f => sOpen(f[0])], ['mDrop', 'mFile', f => mAdd(f)]].forEach(([d, inp, fn]) => {
  const el = $('#' + d);
  ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', e => fn(e.dataTransfer.files));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#' + inp).click(); } });
});
