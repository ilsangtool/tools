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
    $('#fileInfo').innerHTML = `<b>${esc(f.name)}</b> · ${pdf.numPages}쪽 · ${(f.size / 1048576).toFixed(1)}MB`;
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
