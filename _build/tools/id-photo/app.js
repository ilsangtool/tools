const DPMM = 300 / 25.4; // 300dpi 기준 1mm 당 픽셀
const SHEET = { w: 152.4, h: 101.6, margin: 3, gap: 2 }; // 4×6인치 가로
const st = { img: null, z: 1, cx: 0, cy: 0, rot: 0, bright: 100 };
const cv = $('#stage'), ctx = cv.getContext('2d');
let P = 8; // 미리보기 1mm 당 CSS 픽셀

function spec(){
  const v = $('#spec').value;
  if (v === 'custom') return { W: Math.min(120, Math.max(10, +val('cw') || 30)), H: Math.min(120, Math.max(10, +val('ch') || 40)), hmin: 0, hmax: 0 };
  const [W, H, hmin, hmax] = v.split('x').map(Number); return { W, H, hmin, hmax };
}
function dims(){ const iw = st.img.width, ih = st.img.height; return st.rot % 180 ? [ih, iw] : [iw, ih]; }
function kFit(){ const { W, H } = spec(), [rw, rh] = dims(); return Math.max(W / rw, H / rh); }
function fit(){ const { W, H } = spec(); st.z = 1; st.cx = W / 2; st.cy = H / 2; $('#zoom').value = 1; }

function paint(c, pxPerMm, guides){
  const { W, H, hmin, hmax } = spec(), x = c.getContext('2d');
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.scale(pxPerMm, pxPerMm);
  if (st.img) {
    const k = kFit() * st.z, iw = st.img.width * k, ih = st.img.height * k;
    x.save(); x.translate(st.cx, st.cy); x.rotate(st.rot * Math.PI / 180);
    if (st.bright !== 100) x.filter = `brightness(${st.bright}%)`;
    x.imageSmoothingQuality = 'high';
    x.drawImage(st.img, -iw / 2, -ih / 2, iw, ih);
    x.restore();
  }
  if (guides) {
    const top = H * 0.1, len = hmin ? (hmin + hmax) / 2 : H * 0.62, lw = 1 / pxPerMm;
    x.strokeStyle = 'rgba(15,92,74,.9)'; x.lineWidth = 1.5 * lw; x.setLineDash([4 * lw, 3 * lw]);
    x.beginPath(); x.moveTo(0, top); x.lineTo(W, top); x.stroke();
    if (hmin) { x.fillStyle = 'rgba(15,92,74,.14)'; x.fillRect(0, top + hmin, W, hmax - hmin); x.beginPath(); x.moveTo(0, top + hmin); x.lineTo(W, top + hmin); x.moveTo(0, top + hmax); x.lineTo(W, top + hmax); x.stroke(); }
    else { x.beginPath(); x.moveTo(0, top + len); x.lineTo(W, top + len); x.stroke(); }
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.strokeStyle = 'rgba(15,92,74,.35)'; x.stroke();
    x.beginPath(); x.ellipse(W / 2, top + len / 2, len * 0.36, len / 2, 0, 0, Math.PI * 2); x.strokeStyle = 'rgba(15,92,74,.9)'; x.stroke();
    x.setLineDash([]);
    x.font = `500 ${11 * lw}px "Noto Sans KR",sans-serif`; x.fillStyle = 'rgba(15,92,74,1)';
    x.fillText('정수리', 1.5 * lw * 2, top - 3 * lw);
    x.fillText(hmin ? '턱 (이 띠 안)' : '턱', 1.5 * lw * 2, top + (hmin ? hmax : len) + 12 * lw);
  }
  x.restore();
}

function layout(){
  const { W, H } = spec(), wrapW = $('#stageWrap').clientWidth - 28;
  const cssW = Math.min(340, wrapW), cssH = cssW * H / W, maxH = 440;
  const s = cssH > maxH ? maxH / cssH : 1;
  P = cssW * s / W;
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = W * P + 'px'; cv.style.height = H * P + 'px';
  cv.width = Math.round(W * P * dpr); cv.height = Math.round(H * P * dpr);
  draw();
}
function draw(){ paint(cv, cv.width / spec().W, $('#guide').checked); }

function photoCanvas(){
  const { W, H } = spec(), c = document.createElement('canvas');
  c.width = Math.round(W * DPMM); c.height = Math.round(H * DPMM);
  paint(c, DPMM, false); return c;
}
function sheetCanvas(){
  const { W, H } = spec(), S = SHEET, one = photoCanvas();
  const cols = Math.floor((S.w - 2 * S.margin + S.gap) / (W + S.gap)), rows = Math.floor((S.h - 2 * S.margin + S.gap) / (H + S.gap));
  const c = document.createElement('canvas'); c.width = Math.round(S.w * DPMM); c.height = Math.round(S.h * DPMM);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  const gw = cols * W + (cols - 1) * S.gap, gh = rows * H + (rows - 1) * S.gap;
  const ox = (S.w - gw) / 2, oy = (S.h - gh) / 2;
  x.strokeStyle = '#b0b0b0'; x.lineWidth = 2;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const px = (ox + q * (W + S.gap)) * DPMM, py = (oy + r * (H + S.gap)) * DPMM;
    x.drawImage(one, px, py, W * DPMM, H * DPMM);
    x.strokeRect(px - 1, py - 1, W * DPMM + 2, H * DPMM + 2);
  }
  return { c, n: cols * rows, cols, rows };
}
let sheetT;
function updateSheet(){
  clearTimeout(sheetT);
  sheetT = setTimeout(() => {
    if (!st.img) return;
    const { c, n, cols, rows } = sheetCanvas(), p = $('#sheetPrev');
    p.width = 600; p.height = 400; p.getContext('2d').drawImage(c, 0, 0, 600, 400); p.classList.remove('hidden');
    $('#sheetInfo').textContent = n ? `4×6(10×15cm) 인화지 한 장에 ${n}장 (${cols}×${rows})이 들어갑니다.` : '이 크기는 4×6 인화지에 들어가지 않습니다.';
    $('#saveSheet').disabled = !n;
  }, 250);
}
function changed(){ draw(); updateSheet(); }

async function loadFile(f){
  if (!f) return;
  try { st.img = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
  catch (_) {
    st.img = await new Promise((ok, no) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => ok(im); im.onerror = () => no(); im.src = u; })
      .catch(() => { toast('이 사진 형식은 열 수 없습니다. JPG로 바꿔서 넣어 주세요'); return null; });
  }
  if (!st.img) return;
  st.rot = 0; fit();
  $('#empty').classList.add('hidden');
  ['zoom', 'rot', 'fit', 'bright', 'saveOne'].forEach(id => $('#' + id).disabled = false);
  layout(); updateSheet();
}

// 끌기·두 손가락 확대
const ptr = new Map(); let pinch0 = 0, z0 = 1;
cv.addEventListener('pointerdown', e => { if (!st.img) return; cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = st.z; } });
cv.addEventListener('pointermove', e => {
  if (!ptr.has(e.pointerId)) return;
  const prev = ptr.get(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptr.size === 1) { st.cx += (e.clientX - prev[0]) / P; st.cy += (e.clientY - prev[1]) / P; }
  else if (ptr.size === 2 && pinch0) { const [a, b] = [...ptr.values()]; st.z = Math.min(4, Math.max(0.2, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0)); $('#zoom').value = st.z; }
  draw();
});
['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; updateSheet(); }));
cv.addEventListener('wheel', e => { if (!st.img) return; e.preventDefault(); st.z = Math.min(4, Math.max(0.2, st.z * Math.exp(-e.deltaY * 0.0015))); $('#zoom').value = st.z; changed(); }, { passive: false });
cv.addEventListener('keydown', e => { const m = { ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, -.5], ArrowDown: [0, .5] }[e.key]; if (m && st.img) { e.preventDefault(); st.cx += m[0]; st.cy += m[1]; changed(); } });
cv.tabIndex = 0;

$('#file').addEventListener('change', e => loadFile(e.target.files[0]));
$('#zoom').addEventListener('input', () => { st.z = +$('#zoom').value; changed(); });
$('#bright').addEventListener('input', () => { st.bright = +$('#bright').value; changed(); });
$('#rot').addEventListener('click', () => { st.rot = (st.rot + 90) % 360; changed(); });
$('#fit').addEventListener('click', () => { fit(); changed(); });
$('#guide').addEventListener('change', draw);
$('#spec').addEventListener('change', () => { $('#customRow').classList.toggle('hidden', $('#spec').value !== 'custom'); if (st.img) fit(); layout(); updateSheet(); store.set('ilsang_idphoto_v1', { spec: $('#spec').value, cw: val('cw'), ch: val('ch') }); });
['cw', 'ch'].forEach(id => $('#' + id).addEventListener('input', () => { if (st.img) fit(); layout(); updateSheet(); store.set('ilsang_idphoto_v1', { spec: $('#spec').value, cw: val('cw'), ch: val('ch') }); }));
const name = () => { const { W, H } = spec(); return `증명사진_${W}x${H}mm`; };
$('#saveOne').addEventListener('click', () => photoCanvas().toBlob(b => download(b, name() + '.jpg'), 'image/jpeg', 0.95));
$('#saveSheet').addEventListener('click', () => sheetCanvas().c.toBlob(b => download(b, name() + '_4x6인화용.jpg'), 'image/jpeg', 0.95));
window.addEventListener('resize', layout);

const saved = store.get('ilsang_idphoto_v1');
if (saved) { $('#spec').value = saved.spec || $('#spec').value; if (saved.cw) $('#cw').value = saved.cw; if (saved.ch) $('#ch').value = saved.ch; $('#customRow').classList.toggle('hidden', $('#spec').value !== 'custom'); }
layout();
