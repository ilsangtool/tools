"""도구 페이지 조립기: build/tools/<slug>/ 의 조각을 모아 저장소/<slug>/index.html 단일 파일로 출력."""
import json, os, sys, html

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(ROOT)  # 저장소 루트
SITE = 'https://ilsangtool.github.io/tools/'

# 목록 순서 = 도구 모음 화면 순서
TOOLS = [
    ('review-policy', '쇼핑몰 운영', '리뷰 운영정책 고지문 생성기'),
    ('refund-policy', '매장·쇼핑몰 운영', '환불·교환 규정 고지문 생성기'),
    ('noshow-policy', '매장 운영', '예약·노쇼 규정 문구 생성기'),
    ('closed-notice', '매장 운영', '휴무·임시휴업 안내문 만들기'),
    ('weekly-pay', '급여 계산', '알바 주휴수당·월급 계산기'),
    ('dutch-pay', '생활 계산', '더치페이·모임 정산 계산기'),
    ('date-calc', '생활 계산', 'D-day·전역일·만나이 계산기'),
    ('image-resize', '사진 도구', '사진 용량 줄이기·HEIC 변환'),
    ('id-photo', '사진 도구', '증명사진 규격 자르기'),
    ('pdf-to-hwp', '문서 도구', 'PDF 한글 변환·나누기·합치기'),
    ('short-video', '영상 도구', '숏폼 영상 만들기'),
]

def read(p, default=''):
    return open(p, encoding='utf-8').read() if os.path.exists(p) else default

base_css = read(os.path.join(ROOT, 'base.css'))
common_js = read(os.path.join(ROOT, 'common.js'))
RULES_PATH = os.path.join(os.path.dirname(ROOT), 'data', 'rules.json')
RULES = json.load(open(RULES_PATH, encoding='utf-8'))
common_js = common_js.replace('__RULES__', json.dumps({k: v for k, v in RULES.items() if not k.startswith('_')}, ensure_ascii=False))

import datetime, re
TODAY = os.environ.get('BUILD_DATE') or datetime.date.today().isoformat()
def rule_at(lst, d):
    out = {}
    for x in sorted([x for x in lst if x['from'] <= d], key=lambda x: x['from']):
        out.update(x)
    return out
def vars_():
    y = int(TODAY[:4])
    cur = rule_at(RULES['minWage'], TODAY)
    fut = [x for x in RULES['minWage'] if x['from'] > TODAY]
    wl = f"{cur['from'][:4]}년 {cur['hourly']:,}원"
    if fut:
        n = sorted(fut, key=lambda x: x['from'])[-1]
        wl += f" · {n['from'][:4]}년 {n['hourly']:,}원"
        wnext = n
    else:
        wnext = cur
    ns = rule_at(RULES['noshow'], TODAY); ec = rule_at(RULES['ecommerce'], TODAY); mil = rule_at(RULES['military'], TODAY)
    v = {'wage.label': wl, 'wage.years': wl.replace(' · ', ', '), 'wage.next': f"{wnext['hourly']:,}", 'wage.nextYear': wnext['from'][:4],
         'wage.nextHoliday': f"{int(wnext['hourly']*4):,}",
         'noshow.general': ns['general'], 'noshow.reserve': ns['reserve'], 'noshow.group': ns['group'],
         'noshow.from': ns['from'][:4] + '.' + str(int(ns['from'][5:7])), 'noshow.fromFull': ns['from'].replace('-', '.'),
         'ec.days': ec['withdrawDays'], 'ec.months': ec['mismatchMonths'], 'ec.known': ec['mismatchKnownDays'], 'ec.refund': ec['refundBizDays']}
    for k, val in mil.items():
        if isinstance(val, int): v['mil.' + k] = val
    return v
VARS = vars_()
def tpl(s):
    return re.sub(r'\{\{([\w.]+)\}\}', lambda m: str(VARS[m.group(1)]), s)

BRAND_MARK = '<svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#6d1f2c"/><path d="M9 10h14M9 16h14M9 22h9" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>'
# 숏폼은 캔버스 글꼴로 Noto Sans KR을 씀
NOTO = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">'
ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%236d1f2c'/%3E%3Cpath d='M9 10h14M9 16h14M9 22h9' stroke='white' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

# 이용자 수를 받기 전(첫 방문·통신 실패)에 쓰는 순서: 검색 수요가 많은 도구부터
POP_FALLBACK = ['pdf-to-hwp', 'image-resize', 'weekly-pay', 'date-calc', 'id-photo', 'dutch-pay',
                'short-video', 'refund-policy', 'review-policy', 'noshow-policy', 'closed-notice']

# 한국어 줄바꿈: '문자·매장'처럼 가운뎃점으로 이은 말 앞뒤에서 줄이 바뀌지 않게 낱말 잇기 문자(U+2060)를 넣음
# (script·style·pre·textarea·title 안과 태그 속성은 건드리지 않음)
import re as _re
_WJ = '\u2060'
def keep_dots(page):
    out, skip = [], None
    for part in _re.split(r'(<[^>]+>)', page):
        if part.startswith('<'):
            m = _re.match(r'<(/?)(script|style|pre|textarea|title|option|select|label|button)\b', part, _re.I)
            if m: skip = None if m.group(1) else m.group(2).lower()
            out.append(part); continue
        if skip or '·' not in part: out.append(part); continue
        out.append(_re.sub(r'(?<=[가-힣A-Za-z0-9)\]%])·(?=[가-힣A-Za-z0-9(\[])', _WJ + '·' + _WJ, part))
    return ''.join(out)

def related(slug):
    rank = {s: i for i, s in enumerate(POP_FALLBACK)}
    tools = sorted([t for t in TOOLS if t[0] != slug], key=lambda t: rank.get(t[0], 99))
    items = ''.join(f'<li data-slug="{s}"><a href="../{s}/"><i><span>{c}</span>{n}</i></a></li>' for s, c, n in tools)
    return (f'<details class="related" id="related"><summary>함께 쓰면 좋은 무료 도구 <small>{len(tools)}개 · 많이 쓰는 순</small></summary>'
            f'<ol>{items}</ol></details>')

def build(slug):
    d = os.path.join(ROOT, 'tools', slug)
    m = json.loads(tpl(open(os.path.join(d, 'meta.json'), encoding='utf-8').read()))
    url = SITE + slug + '/'
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebApplication", "name": m['h1'], "url": url,
                     "applicationCategory": m.get('category', 'UtilitiesApplication'), "operatingSystem": "All",
                     "inLanguage": "ko", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "KRW"}},
                    ensure_ascii=False)
    faq = ''
    if m.get('faq'):
        faq_ld = json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in m['faq']]},
            ensure_ascii=False)
        faq = f'<script type="application/ld+json">{faq_ld}</script>\n'
        faq_html = '<section class="card faq"><h2>자주 묻는 질문</h2>' + ''.join(
            f'<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in m['faq']) + '</section>'
    else:
        faq_html = ''
    e = html.escape
    page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(m['title'])}</title>
<meta name="description" content="{e(m['desc'])}">
<meta name="keywords" content="{e(m['keywords'])}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(m['title'])}">
<meta property="og:description" content="{e(m.get('og', m['desc']))}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="ko_KR">
<!-- 네이버 서치어드바이저 소유확인 메타태그를 이 아래에 붙여넣으세요 -->
<link rel="icon" href="{ICON}">
<script type="application/ld+json">{ld}</script>
{faq}<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&display=swap" rel="stylesheet">
{NOTO if slug == 'short-video' else ''}
<style>
{base_css}{read(os.path.join(d, 'style.css'))}</style>
</head>
<body>
<div class="topbar"><div class="in">
  <a class="brand" href="../" aria-label="일상툴 처음으로">{BRAND_MARK}일상툴</a>
  <a class="all" href="../">전체 도구</a>
</div></div>
<header>
  <div class="wrap">
    <span class="tag">{e(m['tag'])}</span>
    <h1>{e(m['h1'])}</h1>
    <p>{e(m['lead'])}</p>
  </div>
</header>

<main>
{tpl(read(os.path.join(d, 'body.html')))}
{faq_html}
{related(slug)}
  <footer>
    {m['footer']}<br>
    {'<span id="rulesInfo"></span><br>' if m.get('rules') else ''}
    {m.get('privacy', '입력한 내용은 서버로 전송되지 않습니다.')}
  </footer>
</main>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
(function(){{
{common_js}
{''.join(read(os.path.join(d, f)) + chr(10) for f in sorted(os.listdir(d)) if f.startswith('lib_') and f.endswith('.js'))}{read(os.path.join(d, 'app.js'))}
}})();
</script>
<!-- 앱 관제 오비트 이용자 카운터 (방문 수만 집계, 입력 내용·개인정보 전송 없음) -->
<script defer src="../assets/feedback.js"></script>
<script async src="https://gurifire.github.io/orbit/track.js"></script>
</body>
</html>
'''
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    page = keep_dots(page)
    open(os.path.join(OUT, slug, 'index.html'), 'w', encoding='utf-8').write(page)
    print('built', slug, len(page.encode()), 'bytes')

# 손으로 만든 첫 화면·리뷰 고지문 생성기에도 같은 줄바꿈 처리
for f in ('index.html', os.path.join('review-policy', 'index.html')):
    fp = os.path.join(OUT, f)
    if os.path.exists(fp):
        t = open(fp, encoding='utf-8').read(); n = keep_dots(t)
        if n != t: open(fp, 'w', encoding='utf-8').write(n)

for s, _, _ in TOOLS:
    if s != 'review-policy' and os.path.exists(os.path.join(ROOT, 'tools', s, 'meta.json')):
        build(s)
