/* ===== 추가 저장기: XLSX(엑셀) · PPTX(파워포인트, 고칠 수 있는 글상자·표) · 쪽 그림(JPG·PNG) ===== */
const ptPx = pt => pt * 96 / 72;
const alignXl = { J: 'left', L: 'left', C: 'center', R: 'right' };

/* ---- 엑셀: 원본 표 크기 그대로 (열 너비·행 높이·글꼴·정렬·용지) ---- */
function makeXlsx(blocks, title, page){
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  // 숫자처럼 보이는 칸은 숫자로 (전화번호·우편번호처럼 0으로 시작하는 값은 글자 그대로)
  const asNum = t => { const s = t.trim(); if (!/^-?(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d+)?%?$/.test(s)) return null; const v = parseFloat(s.replace(/[,%]/g, '')); return Number.isFinite(v) ? (s.endsWith('%') ? v / 100 : v) : null; };
  const paraText = p => p.runs.map(r => r.t).join('');
  // 열 너비: pt → 화면 px → 엑셀 '글자 수' 단위 (기본 글꼴 맑은 고딕 11pt, 숫자 폭 8px 기준)
  const colW = pt => Math.max(0.5, (ptPx(pt) - 5) / 8);
  // 글꼴·셀 모양 목록 (같은 모양은 한 번만)
  const fonts = ['<font><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>'], fontKey = { '11||0': 0 };
  const fontId = (sz, ff, b) => { const k = `${sz}|${ff}|${b ? 1 : 0}`; if (fontKey[k] == null) { fontKey[k] = fonts.length; fonts.push(`<font>${b ? '<b/>' : ''}<sz val="${sz}"/><name val="${xesc(ff || '맑은 고딕')}"/><family val="${/바탕|명조|궁서/.test(ff || '') ? 1 : 2}"/><charset val="129"/></font>`); } return fontKey[k]; };
  // 테두리: 왼·오른·위·아래 조합마다 하나씩
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], bdKey = { '0000': 0 };
  const side = (n, on) => on ? `<${n} style="thin"><color rgb="FF000000"/></${n}>` : `<${n}/>`;
  const bd = (l, r, t, b) => { const k = `${+!!l}${+!!r}${+!!t}${+!!b}`; if (bdKey[k] == null) { bdKey[k] = borders.length; borders.push(`<border>${side('left', l)}${side('right', r)}${side('top', t)}${side('bottom', b)}<diagonal/></border>`); } return bdKey[k]; };
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], xfKey = { '': 0 };
  const xfId = (fid, h, v, border, pct, indent) => {
    const k = `${fid}|${h}|${v}|${border}|${pct}|${indent || 0}`;
    if (xfKey[k] == null) { xfKey[k] = xfs.length; xfs.push(`<xf numFmtId="${pct ? 164 : 0}" fontId="${fid}" fillId="0" borderId="${border === true ? bd(1, 1, 1, 1) : border || 0}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"${pct ? ' applyNumberFormat="1"' : ''}><alignment horizontal="${h}" vertical="${v}"${indent ? ` indent="${indent}"` : ''} wrapText="1"/></xf>`); }
    return xfKey[k];
  };
  const styleOf = (paras, va, border, text) => {
    const r0 = (paras[0] && paras[0].runs.find(r => r.t.trim())) || {};
    const sz = Math.round((r0.sz || 10) * 2) / 2, b = paras.length && paras.every(p => p.runs.every(r => !r.t.trim() || r.b));
    const p0 = paras[0] || {}, ind = p0.align === 'R' && p0.mr ? Math.min(15, Math.round(ptPx(p0.mr) / 10)) : 0; // 오른쪽 여백은 들여쓰기 칸수로
    return xfId(fontId(sz, r0.ff, b), alignXl[p0.align || 'L'], va === 'T' ? 'top' : va === 'B' ? 'bottom' : 'center', border, /%$/.test(text.trim()), ind);
  };
  const cellXml = (ref, text, s) => {
    const n = asNum(text);
    if (n != null) return `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xesc(text)}</t></is></c>`;
  };
  // 인쇄: PDF와 같은 용지·여백 (A4·A5·B5·레터는 용지 번호로, 그 밖에는 A4)
  const paper = !page ? 9 : (() => { const w = Math.min(page.W, page.H), h = Math.max(page.W, page.H), near = (a, b) => Math.abs(a - b) < 6; return near(w, 595) && near(h, 842) ? 9 : near(w, 420) && near(h, 595) ? 11 : near(w, 516) && near(h, 729) ? 13 : near(w, 612) && near(h, 792) ? 1 : 9; })();
  const inch = v => (v / 72).toFixed(3);
  // 한 칸 안에 글꼴·크기·굵기가 섞여 있으면 서식 있는 글자(rich text)로 그대로 옮김
  const richCell = (ref, paras, text, st) => {
    const runs = [];
    // 문단 앞 띄움(sb)은 빈 줄로 바꿔 칸 안 세로 위치를 비슷하게 (엑셀은 문단 간격이 없음)
    const LHx = (page && page.lineH) || 1.6;
    paras.forEach((p, i) => p.runs.forEach((r, j) => {
      if (!r.t) return;
      const gap = !j && p.sb ? '\n'.repeat(Math.min(6, Math.round(p.sb / ((r.sz || 10) * LHx)))) : '';
      const ind = !j && p.ml > 2 && p.align !== 'C' && p.align !== 'R' ? ' '.repeat(Math.round(p.ml / ((r.sz || 10) * 0.33))) : ''; // 들여쓰기는 앞 공백으로
      runs.push({ ...r, t: (i && !j ? '\n' : '') + gap + ind + r.t });
    }));
    const key = r => `${Math.round((r.sz || 10) * 2)}|${r.ff}|${!!r.b}`;
    if (asNum(text) != null) return cellXml(ref, text, st);
    if (runs.length < 2 || runs.every(r => key(r) === key(runs[0]))) return cellXml(ref, runs.map(r => r.t).join(''), st);
    const rx = runs.map(r => `<r><rPr>${r.b ? '<b/>' : ''}<sz val="${Math.round((r.sz || 10) * 2) / 2}"/><rFont val="${xesc(r.ff || '맑은 고딕')}"/><charset val="129"/></rPr><t xml:space="preserve">${xesc(r.t)}</t></r>`).join('');
    return `<c r="${ref}" s="${st}" t="inlineStr"><is>${rx}</is></c>`;
  };
  const sheets = [];
  const tables = blocks.filter(b => b.type === 'table');
  tables.forEach((t, k) => {
    // 원래 행 경계(y)에 더해, 한 칸 안에서 정렬이 다른 줄이나 크게 띄운 줄이 있으면 그 사이도 엑셀 행으로 나눔
    // → 줄마다 정렬·세로 위치를 원본대로 두고, 칸 안쪽 경계선은 감춰 원래 칸 하나처럼 보이게
    const ys = [t.yT]; t.rows.forEach(h => ys.push(ys[ys.length - 1] + h));
    const cuts = new Set(ys.map(y => +y.toFixed(1)));
    const splitOf = c => {
      const ps = c.paras.filter(p => p.yT != null).sort((a, b) => a.yT - b.yT);
      if (ps.length < 2) return null;
      const mixed = new Set(ps.map(p => p.align === 'J' ? 'L' : p.align)).size > 1;
      const gappy = ps.some((p, i) => i && (p.sb || 0) >= (p.sz || 10));
      return mixed || gappy ? ps : null;
    };
    const bands = new Map();
    t.cells.forEach(c => {
      const ps = splitOf(c); if (!ps) return;
      const top = ys[c.r], bot = ys[c.r + c.rs], b = [top];
      for (let i = 1; i < ps.length; i++) { const y = +((ps[i - 1].yB + ps[i].yT) / 2).toFixed(1); if (y > b[b.length - 1] + 1 && y < bot - 1) { b.push(y); cuts.add(y); } }
      b.push(bot);
      if (b.length - 1 === ps.length) bands.set(c, { b, ps });
    });
    const Y = [...cuts].sort((a, b) => a - b), at = y => Y.findIndex(v => Math.abs(v - y) < 0.06);
    const R = Y.length - 1, C = t.cols.length;
    const grid = Array.from({ length: R }, () => Array(C).fill(null)), merges = [];
    const place = (r0, r1, c0, c1, paras, va, edge) => { // r1·c1은 포함
      if (r1 < r0) r1 = r0;
      const reg = { r0, r1, c0, c1, paras, va, edge };
      for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) grid[r][q] = reg;
      if (r1 > r0 || c1 > c0) merges.push(`${colName(c0)}${r0 + 1}:${colName(c1)}${r1 + 1}`);
    };
    t.cells.forEach(c => {
      const c0 = c.c, c1 = c.c + c.cs - 1, sp = bands.get(c);
      if (!sp) { place(at(ys[c.r]), at(ys[c.r + c.rs]) - 1, c0, c1, c.paras, c.va, { T: 1, B: 1 }); return; }
      sp.ps.forEach((p, i) => place(at(sp.b[i]), at(sp.b[i + 1]) - 1, c0, c1, [{ ...p, sb: 0 }], 'C', { T: i === 0, B: i === sp.ps.length - 1 }));
    });
    const rows = Y.slice(1).map((y, r) => `<row r="${r + 1}" ht="${(y - Y[r]).toFixed(2)}" customHeight="1">` + t.cols.map((_, q) => {
      const ref = colName(q) + (r + 1), g = grid[r][q];
      if (!g) return `<c r="${ref}" s="${xfId(0, 'left', 'center', bd(1, 1, 1, 1), false)}"/>`;
      const b = bd(q === g.c0, q === g.c1, r === g.r0 && g.edge.T, r === g.r1 && g.edge.B);
      const text = g.paras.map(paraText).join('\n');
      const st = styleOf(g.paras, g.va, b, text);
      return r === g.r0 && q === g.c0 ? richCell(ref, g.paras, text, st) : `<c r="${ref}" s="${st}"/>`;
    }).join('') + '</row>').join('');
    const cols = t.cols.map((w, q) => `<col min="${q + 1}" max="${q + 1}" width="${colW(w).toFixed(2)}" customWidth="1"/>`).join('');
    sheets.push({ name: `표${k + 1}`, xml: sheetXml(cols, rows, merges) });
  });
  // 본문: 문단 한 줄씩, 원본 글자 크기·정렬 (표 자리는 "[표N]")
  let r = 0, tn = 0; const body = [];
  const bodyW = page ? page.W - page.ml - page.mr : 480;
  for (const b of blocks) {
    if (b.type === 'table') { tn++; body.push(`<row r="${++r}">${cellXml('A' + r, `[표${tn}] '표${tn}' 시트 참고`, xfId(0, 'left', 'center', false, false))}</row>`); continue; }
    const t = paraText(b); if (!t.trim()) continue;
    const sz = Math.max(...b.runs.map(x => x.sz || 10));
    body.push(`<row r="${++r}" ht="${(sz * ((page && page.lineH) || 1.6)).toFixed(2)}" customHeight="1">${cellXml('A' + r, t, styleOf([b], 'C', false, t))}</row>`);
  }
  if (body.length) sheets.push({ name: '본문', xml: sheetXml(`<col min="1" max="1" width="${colW(bodyW).toFixed(2)}" customWidth="1"/>`, body.join(''), []) });
  if (!sheets.length) sheets.push({ name: '본문', xml: sheetXml('', '', []) });

  function sheetXml(cols, rows, merges){
    const mg = page ? `<pageMargins left="${inch(page.ml)}" right="${inch(page.mr)}" top="${inch(page.mt)}" bottom="${inch(page.mb)}" header="0" footer="0"/>` : '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="16.5"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}${mg}<pageSetup paperSize="${paper}" orientation="${page && page.W > page.H ? 'landscape' : 'portrait'}"/></worksheet>`;
  }
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.##%"/></numFmts>' +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="표준" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      sheets.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, s.xml]),
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title || '')}</dc:title><dc:creator>일상툴 PDF 변환</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`]
  ];
  return { blob: zipStore(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), sheets: sheets.map(s => s.name) };
}

/* ---- 파워포인트: PDF 한 쪽 = 슬라이드 한 장, 글은 글상자·표는 표로 (모두 고칠 수 있음) ---- */
function makePptx(pages, title, lineH){ // pages: [{W, H, blocks}] — W·H는 pt, blocks는 finishPage 결과(쪽 안 위치 포함)
  const EMU = 12700, E = v => Math.round(v * EMU), clampS = v => Math.max(914400, Math.min(51206400, Math.round(v)));
  const SW = clampS(pages[0].W * EMU), SH = clampS(pages[0].H * EMU), LH = lineH || 1.6;
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const algn = { J: 'just', L: 'l', C: 'ctr', R: 'r' };
  const runX = r => { const f = xesc(r.ff || '맑은 고딕'); return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${Math.round((r.sz || 10) * 100)}"${r.b ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="${f}"/><a:ea typeface="${f}"/><a:cs typeface="${f}"/></a:rPr><a:t>${xesc(r.t)}</a:t></a:r>`; };
  const paraX = (p, inCell) => {
    const big = Math.max(...p.runs.map(r => r.sz || 10), p.sz || 0, 8);
    const ind = inCell ? '' : `${p.ml ? ` marL="${E(p.ml)}"` : ''}${p.fi ? ` indent="${E(p.fi)}"` : ''}`;
    const runs = p.runs.filter(r => r.t).map(runX).join('');
    return `<a:p><a:pPr algn="${algn[p.align || 'L']}"${ind}${inCell && p.ml ? ` marL="${E(p.ml)}"` : ''}><a:lnSpc><a:spcPts val="${Math.round(big * LH * 100)}"/></a:lnSpc>${p.sb ? `<a:spcBef><a:spcPts val="${Math.round(p.sb * 100)}"/></a:spcBef>` : ''}<a:buNone/></a:pPr>${runs}<a:endParaRPr lang="ko-KR" sz="${Math.round(big * 100)}" dirty="0"/></a:p>`;
  };
  let id = 2;
  const textBox = p => {
    // 문단 하나 = 글상자 하나, 원래 자리(본문 폭 기준)에. 글꼴 폭 차이로 줄이 넘치지 않게 오른쪽에 여유
    const x = p.ax1, w = Math.max(20, p.ax2 - p.ax1 - (p.mr || 0)), big = Math.max(...p.runs.map(r => r.sz || 10), 8);
    const y = p.yT - big * (LH - 1.06) / 2, h = Math.max(p.yB - p.yT, big) + big * (LH - 1.06);
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="글상자 ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(w)}" cy="${E(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paraX({ ...p, sb: 0 })}</p:txBody></p:sp>`;
  };
  const ln = s => `<a:${s} w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/></a:${s}>`;
  const tableFrame = t => {
    const x = t.ax1 + (t.x1 || 0), y = t.yT, W = t.cols.reduce((a, b) => a + b, 0), H = t.rows.reduce((a, b) => a + b, 0);
    const owner = t.rows.map(() => t.cols.map(() => null));
    t.cells.forEach(c => { for (let r = c.r; r < c.r + c.rs; r++) for (let q = c.c; q < c.c + c.cs; q++) owner[r][q] = c; });
    const tcPr = c => `<a:tcPr marL="${E(5)}" marR="${E(5)}" marT="${E(1.5)}" marB="${E(1.5)}" anchor="${c && c.va === 'T' ? 't' : 'ctr'}">${ln('lnL')}${ln('lnR')}${ln('lnT')}${ln('lnB')}<a:noFill/></a:tcPr>`;
    const empty = '<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR" dirty="0"/></a:p></a:txBody>';
    let rows = '';
    t.rows.forEach((h, r) => {
      rows += `<a:tr h="${E(h)}">`;
      t.cols.forEach((_, q) => {
        const c = owner[r][q];
        if (!c) { rows += `<a:tc>${empty}${tcPr(null)}</a:tc>`; return; }
        if (c.r !== r || c.c !== q) { rows += `<a:tc${c.c !== q ? ' hMerge="1"' : ''}${c.r !== r ? ' vMerge="1"' : ''}>${empty}${tcPr(c)}</a:tc>`; return; }
        const body = c.paras.length ? c.paras.map(p => paraX(p, true)).join('') : '<a:p><a:endParaRPr lang="ko-KR" dirty="0"/></a:p>';
        rows += `<a:tc${c.cs > 1 ? ` gridSpan="${c.cs}"` : ''}${c.rs > 1 ? ` rowSpan="${c.rs}"` : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${body}</a:txBody>${tcPr(c)}</a:tc>`;
      });
      rows += '</a:tr>';
    });
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id++}" name="표 ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(W)}" cy="${E(H)}"/></p:xfrm>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="0" bandRow="0"/><a:tblGrid>${t.cols.map(w => `<a:gridCol w="${E(w)}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  };
  const tree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const slides = pages.map(pg => {
    id = 2;
    const items = (pg.blocks || []).filter(b => b.yT != null && (b.type === 'table' || b.runs.some(r => r.t.trim()))).map(b => b.type === 'table' ? tableFrame(b) : textBox(b)).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree>${tree}${items}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  });
  return pptxPackage(slides, SW, SH, title);
}

function pptxPackage(slides, SW, SH, title){
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const emptyTree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>';
  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const master = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}>${emptyTree.replace('<p:cSld>', '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>')}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
  const layout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank" preserve="1">${emptyTree.replace('<p:cSld>', '<p:cSld name="빈 화면">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>` +
      slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('') +
      `</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>` +
      slides.map((_, i) => `<Relationship Id="rId${i + 3}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('') + '</Relationships>'],
    ['ppt/slideMasters/slideMaster1.xml', master],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', layout],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', theme],
    ...slides.flatMap((x, i) => [
      [`ppt/slides/slide${i + 1}.xml`, x],
      [`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`]
    ]),
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title || '')}</dc:title><dc:creator>일상툴 PDF 변환</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`]
  ];
  return zipStore(files, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

/* ---- 쪽 그림 ---- */
// dpi 기준으로 한 쪽을 그린다. 휴대폰 메모리를 생각해 한 장 최대 약 1,600만 화소로 제한
async function renderAtDpi(page, dpi){
  const vp1 = page.getViewport({ scale: 1 });
  let s = dpi / 72;
  const px = vp1.width * vp1.height * s * s;
  if (px > 16e6) s *= Math.sqrt(16e6 / px);
  const vp = page.getViewport({ scale: s });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { cv, w: vp1.width, h: vp1.height };
}
const canvasBytes = (cv, type, q) => new Promise((ok, no) => cv.toBlob(b => b ? b.arrayBuffer().then(a => ok(new Uint8Array(a))) : no(new Error('그림을 만들지 못했습니다 (메모리 부족)')), type, q));
