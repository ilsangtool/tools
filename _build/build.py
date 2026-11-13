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

ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230f5c4a'/%3E%3Cpath d='M9 10h14M9 16h14M9 22h9' stroke='white' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

def related(slug):
    items = ''.join(
        f'<li><a href="../{s}/"><span>{c}</span>{n}</a></li>' for s, c, n in TOOLS if s != slug)
    return f'<nav class="related" aria-label="다른 도구"><h2>함께 쓰면 좋은 무료 도구</h2><ul>{items}</ul></nav>'

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
{faq}<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
{base_css}  .faq details{{border-bottom:1px solid var(--line);padding:8px 0}}
  .faq summary{{cursor:pointer;font-weight:500;font-size:14.5px}}
  .faq p{{margin:6px 0 2px;color:var(--sub);font-size:14px}}
{read(os.path.join(d, 'style.css'))}</style>
</head>
<body>
<header>
  <div class="wrap">
    <a class="back" href="../">← 생활·업무 도구 모음</a><br>
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
{read(os.path.join(d, 'app.js'))}
}})();
</script>
<!-- 앱 관제 오비트 이용자 카운터 (방문 수만 집계, 입력 내용·개인정보 전송 없음) -->
<script async src="https://gurifire.github.io/orbit/track.js"></script>
</body>
</html>
'''
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    open(os.path.join(OUT, slug, 'index.html'), 'w', encoding='utf-8').write(page)
    print('built', slug, len(page.encode()), 'bytes')

for s, _, _ in TOOLS:
    if s != 'review-policy' and os.path.exists(os.path.join(ROOT, 'tools', s, 'meta.json')):
        build(s)
