"""일상툴 법령 기준값 자동 점검 (GitHub Actions에서 주 2회 실행)

하는 일
1) 숫자 기준값(최저임금, 건강·장기요양·고용보험료율)
   - 최근 뉴스(구글 뉴스 RSS)에서 값을 뽑아, 서로 다른 언론사 2곳 이상이 같은 값을 보도하고
     정상 범위 안이면 data/rules.json 에 자동 반영 → 도구에 바로 적용
   - 반영할 때마다 GitHub 이슈로 "자동 반영" 알림(출처 링크 포함)
2) 문장으로 된 규정(청약철회, 노쇼 위약금 기준, 복무기간, 주휴수당, 국민연금 단계 인상)
   - 개정 관련 보도가 나오면 GitHub 이슈로 "확인 필요" 알림 (잘못 고치면 위험하므로 자동 수정 안 함)
3) (선택) 국가법령정보센터 Open API 키(LAW_OC)를 넣으면 관련 법령의 시행일 변경도 감지

외부 패키지 없이 표준 라이브러리만 사용.
"""
import datetime as dt, email.utils, hashlib, json, os, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_P = os.path.join(REPO_ROOT, 'data', 'rules.json')
STATE_P = os.path.join(REPO_ROOT, 'data', 'law-watch-state.json')
TODAY = dt.date.fromisoformat(os.environ.get('WATCH_DATE') or dt.date.today().isoformat())
UA = {'User-Agent': 'Mozilla/5.0 (ilsangtool law-watch; +https://github.com/ilsangtool/tools)'}
WINDOW_DAYS = 60
log = lambda *a: print('[law-watch]', *a, flush=True)

# ---------- 공통 ----------
def http(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')

def news(query):
    """구글 뉴스 RSS 검색 → [{title, link, source, date, text}]"""
    if os.environ.get('NEWS_FIXTURE'):  # 테스트용
        return [x for x in json.load(open(os.environ['NEWS_FIXTURE'], encoding='utf-8')) if x.get('q') == query]
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode(
        {'q': f'{query} when:{WINDOW_DAYS}d', 'hl': 'ko', 'gl': 'KR', 'ceid': 'KR:ko'})
    try:
        root = ET.fromstring(http(url))
    except Exception as e:
        log('뉴스 조회 실패', query, e); return None
    out = []
    for it in root.iter('item'):
        title = (it.findtext('title') or '').strip()
        src = (it.findtext('source') or '').strip()
        if src and title.endswith(' - ' + src): title = title[: -len(src) - 3]
        try: d = email.utils.parsedate_to_datetime(it.findtext('pubDate')).date()
        except Exception: d = TODAY
        desc = re.sub(r'<[^>]+>', ' ', it.findtext('description') or '')
        out.append({'title': title, 'link': it.findtext('link') or '', 'source': src or 'unknown', 'date': d.isoformat(), 'text': title + ' ' + desc})
    return out

def rule_at(lst, d):
    out = {}
    for x in sorted([x for x in lst if x['from'] <= d], key=lambda x: x['from']): out.update(x)
    return out

def target_year(text, pub, default_next):
    m = re.search(r'(20\d\d)년', text)
    if m and abs(int(m.group(1)) - pub.year) <= 1: return int(m.group(1))
    if '내년' in text: return pub.year + 1
    if '올해' in text: return pub.year
    return pub.year + 1 if default_next(pub) else pub.year

def won_values(text):
    """'1만700원', '1만 700원', '10,700원', '1만원' → 정수 목록"""
    vals = []
    for a, b in re.findall(r'(?<!\d)(\d)만\s*(\d{1,4})?\s*원', text): vals.append(int(a) * 10000 + int(b or 0))
    for n in re.findall(r'(?<![\d.])(\d{1,2},\d{3})\s*원', text): vals.append(int(n.replace(',', '')))
    return vals

def pct_values(text):
    return [float(x) for x in re.findall(r'(\d+(?:\.\d+)?)\s*%', text)]

# ---------- 숫자 기준값 ----------
def consensus(items, extract, default_next):
    """(연도, 값)별로 보도한 언론사 수를 셈. 2곳 이상이면 확정 후보"""
    votes = {}
    for it in items:
        pub = dt.date.fromisoformat(it['date'])
        if (TODAY - pub).days > WINDOW_DAYS: continue
        for v in extract(it['title']) or extract(it['text']):
            y = target_year(it['title'], pub, default_next)
            votes.setdefault((y, v), {}).setdefault(it['source'], it)
    return {k: list(s.values()) for k, s in votes.items()}

def after_july(p): return p.month >= 7

def check_min_wage(R, items):
    known = {int(x['from'][:4]): x['hourly'] for x in R['minWage']}
    base = known[max(known)]
    kw = ('결정', '확정', '고시', '의결', '최종')
    rel = [i for i in items if '최저임금' in i['title'] and any(k in i['title'] for k in kw)]
    ok = lambda v: base * 0.95 <= v <= base * 1.30
    # 한 기사에 '1만320원→1만700원'처럼 두 값이 있으면 새로 정해진 큰 값만 씀
    res = consensus(rel, lambda t: [max(vs)] if (vs := [v for v in won_values(t) if ok(v)]) else [], after_july)
    return [('minWage', y, v, srcs) for (y, v), srcs in res.items() if y >= TODAY.year and known.get(y) != v]

def check_rate(R, items, key, words, conv, default_next=after_july):
    rel = [i for i in items if any(w in i['title'] for w in words)]
    # 'A%에서 B%로'처럼 여러 값이면 마지막(바뀐 뒤) 값만 씀
    res = consensus(rel, lambda t: [cs[-1]] if (cs := [c for c in (conv(v) for v in pct_values(t)) if c is not None]) else [], default_next)
    out = []
    for (y, v), srcs in res.items():
        if y < TODAY.year: continue
        cur = rule_at(R['insurance'], f'{y}-01-01').get(key)
        if cur is None or abs(cur - v) > 1e-6: out.append((key, y, v, srcs))
    return out

# 각 보험료율: 기사에 나오는 % → rules.json 단위로 바꾸기 (범위 밖이면 무시)
def hi_conv(v):   return round(v / 200, 6) if 6.0 <= v <= 9.5 else None            # 직장 7.19% → 근로자 0.03595
def ei_conv(v):   return round(v / 200, 6) if 1.4 <= v <= 2.6 else None            # 실업급여 1.8% → 근로자 0.009
def ltc_conv_f(R, y):
    hi_total = rule_at(R['insurance'], f'{y}-01-01')['hi'] * 2
    def f(v):
        if 0.6 <= v <= 1.6: return round(v / 100 / hi_total, 4)                  # 소득 대비 0.9448%
        if 10 <= v <= 20:  return round(v / 100, 4)                              # 건보료 대비 13.14%
        return None
    return f

def apply(R, changes):
    for key, y, v, srcs in changes:
        src = '뉴스 교차확인 자동 반영: ' + ', '.join(sorted({s['source'] for s in srcs})[:4])
        frm = f'{y}-01-01'
        if key == 'minWage':
            R['minWage'] = [x for x in R['minWage'] if x['from'] != frm] + [{'from': frm, 'hourly': v, 'source': src}]
            R['minWage'].sort(key=lambda x: x['from'])
        else:
            field = {'hi': 'hi', 'ei': 'ei', 'ltcRatio': 'ltcRatio'}[key]
            ent = next((x for x in R['insurance'] if x['from'] == frm), None)
            if not ent:
                ent = {'from': frm}; R['insurance'].append(ent); R['insurance'].sort(key=lambda x: x['from'])
            ent[field] = v
            ent['source'] = (ent.get('source', '') + ' / ' if ent.get('source') else '') + f'{field} {src}'

# ---------- 문장 규정: 알림만 ----------
ALERTS = [
    ('ecommerce', '전자상거래법 청약철회 개정', ['청약철회', '전자상거래법'], ['개정', '시행', '변경', '연장', '단축'], 'refund-policy (환불·교환 규정)'),
    ('noshow', '노쇼 위약금 소비자분쟁해결기준', ['노쇼', '예약부도', '소비자분쟁해결기준'], ['개정', '상향', '변경', '시행', '위약금'], 'noshow-policy (예약·노쇼 규정)'),
    ('military', '병 복무기간 단축', ['복무기간', '군 복무', '복무 기간'], ['단축', '개정', '변경', '연장'], 'date-calc (전역일)'),
    ('weeklyHoliday', '주휴수당 근로기준법 개정', ['주휴수당', '주휴일'], ['개정', '폐지', '변경', '시행', '국회 통과'], 'weekly-pay (주휴 조건)'),
    ('np', '국민연금 보험료율 인상', ['국민연금 보험료율', '연금 보험료율', '국민연금 보험료'], ['개정', '인상', '변경', '조정'], 'weekly-pay (국민연금 단계 인상표)'),
]
def alert_items(R, key, items, must, verbs):
    out = []
    for it in items:
        pub = dt.date.fromisoformat(it['date'])
        if (TODAY - pub).days > 21: continue  # 최근 3주 보도만 알림
        t = it['title']
        if any(m in t for m in must) and any(v in t for v in verbs):
            if key == 'np':  # 이미 반영된 단계 인상표와 같은 숫자면 무시
                known = {round(x['np'] * 200, 1) for x in R['insurance'] if 'np' in x}
                ps = [p for p in pct_values(t) if 9 <= p <= 20]
                if ps and all(round(p, 1) in known for p in ps): continue
            out.append(it)
    return out

# ---------- (선택) 국가법령정보센터 ----------
LAWS = ['근로기준법', '최저임금법', '국민연금법', '국민건강보험법 시행령', '노인장기요양보험법 시행령',
        '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령',
        '전자상거래 등에서의 소비자보호에 관한 법률', '전자상거래 등에서의 소비자보호에 관한 법률 시행령', '병역법', '병역법 시행령']
def law_versions(oc):
    out = {}
    for name in LAWS:
        try:
            j = json.loads(http('https://www.law.go.kr/DRF/lawSearch.do?' + urllib.parse.urlencode(
                {'OC': oc, 'target': 'law', 'type': 'JSON', 'query': name, 'display': 20})))
            rows = j.get('LawSearch', {}).get('law', [])
            rows = rows if isinstance(rows, list) else [rows]
            hit = [r for r in rows if r.get('법령명한글', '').replace(' ', '') == name.replace(' ', '')]
            if hit:
                latest = max(hit, key=lambda r: (r.get('시행일자', ''), r.get('법령일련번호', '')))
                out[name] = {'시행일자': latest.get('시행일자'), '공포일자': latest.get('공포일자'), 'MST': latest.get('법령일련번호')}
        except Exception as e:
            log('법령 API 실패', name, e)
    return out

# ---------- GitHub 이슈 ----------
def issue(title, body):
    tok, repo = os.environ.get('GITHUB_TOKEN'), os.environ.get('GITHUB_REPOSITORY')
    if not tok or not repo:
        log('ISSUE (로컬 출력)', title); print(body); return
    req = urllib.request.Request(f'https://api.github.com/repos/{repo}/issues', method='POST',
        data=json.dumps({'title': title, 'body': body}).encode(),
        headers={'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.github+json', **UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: log('이슈 생성', r.status, title)
    except Exception as e: log('이슈 생성 실패', e)

def links(srcs): return '\n'.join(f'- [{s["source"]}] [{s["title"]}]({s["link"]}) ({s["date"]})' for s in srcs[:6])

# ---------- 실행 ----------
def main():
    R = json.load(open(RULES_P, encoding='utf-8'))
    S = json.load(open(STATE_P, encoding='utf-8')) if os.path.exists(STATE_P) else {'seen': [], 'laws': {}}
    seen = set(S.get('seen', []))
    failures = []

    changes = []
    feeds = {q: news(q) for q in ['최저임금 시간급', '건강보험료율', '장기요양보험료율', '고용보험료율']}
    for q, f in feeds.items():
        if f is None: failures.append(q)
    if feeds['최저임금 시간급']: changes += check_min_wage(R, feeds['최저임금 시간급'])
    if feeds['건강보험료율']: changes += check_rate(R, feeds['건강보험료율'], 'hi', ['건강보험료율', '건보료율'], hi_conv)
    if feeds['고용보험료율']: changes += check_rate(R, feeds['고용보험료율'], 'ei', ['고용보험료율', '실업급여 보험료율'], ei_conv)
    if feeds['장기요양보험료율']:
        y = TODAY.year + (1 if TODAY.month >= 7 else 0)
        changes += check_rate(R, feeds['장기요양보험료율'], 'ltcRatio', ['장기요양보험료율'], ltc_conv_f(R, y))
    # 같은 (항목, 연도)에 값이 둘 이상 나오면 자동 반영하지 않고 확인 요청
    by = {}
    for c in changes: by.setdefault((c[0], c[1]), []).append(c)
    safe = [v[0] for v in by.values() if len(v) == 1]
    for (k, y), v in by.items():
        if len(v) > 1:
            key = f'conflict:{k}:{y}:' + ','.join(str(c[2]) for c in v)
            if key not in seen:
                seen.add(key)
                issue(f'[확인 필요] {y}년 {k} 값이 기사마다 다릅니다', '\n\n'.join(f'**{c[2]}**\n{links(c[3])}' for c in v) + '\n\n`data/rules.json`에서 직접 고쳐 주세요.')
    if safe:
        apply(R, safe)
        for k, y, v, srcs in safe:
            label = {'minWage': f'{y}년 최저시급 {v:,}원', 'hi': f'{y}년 건강보험료율(근로자) {v*100:.3f}%',
                     'ei': f'{y}년 고용보험료율(근로자) {v*100:.2f}%', 'ltcRatio': f'{y}년 장기요양보험료(건보료 대비) {v*100:.2f}%'}[k]
            issue(f'[자동 반영] {label}', f'서로 다른 언론사 {len({s["source"] for s in srcs})}곳의 보도가 일치해 `data/rules.json`에 반영했습니다. 시행일({y}.1.1)부터 도구에 자동 적용됩니다.\n\n{links(srcs)}\n\n값이 틀리면 `data/rules.json`을 고치거나 이 커밋을 되돌려 주세요.')

    for key, q, must, verbs, tool in ALERTS:
        items = news(q)
        if items is None: failures.append(q); continue
        hits = [i for i in alert_items(R, key, items, must, verbs) if hashlib.sha1(i['link'].encode()).hexdigest()[:12] not in seen]
        if hits:
            for i in hits: seen.add(hashlib.sha1(i['link'].encode()).hexdigest()[:12])
            issue(f'[확인 필요] {q} 관련 보도 {len(hits)}건 — {tool}',
                  f'관련 규정이 바뀌었을 수 있습니다. 실제 개정·시행일을 확인하고, 바뀌었으면 `data/rules.json`의 `{key}` 항목에 새 `from`(시행일)과 값을 추가하세요.\n\n' + links(hits))

    oc = os.environ.get('LAW_OC')
    if oc:
        cur = law_versions(oc)
        if not cur: failures.append('국가법령정보센터 API')
        for name, v in cur.items():
            old = S.get('laws', {}).get(name)
            if old and old != v:
                issue(f'[확인 필요] {name} 개정 감지 (시행 {v["시행일자"]})',
                      f'국가법령정보센터에서 새 버전이 확인됐습니다.\n- 이전: {old}\n- 현재: {v}\n\nhttps://www.law.go.kr/법령/{urllib.parse.quote(name.replace(" ", ""))}')
            S.setdefault('laws', {})[name] = v

    if len(failures) >= 6:
        key = f'fail:{TODAY.isocalendar()[0]}-{TODAY.isocalendar()[1]}'
        if key not in seen:
            seen.add(key); issue('[점검 실패] 법령 자동 점검이 자료를 가져오지 못했습니다', '실패한 조회: ' + ', '.join(failures) + '\n\nActions 로그를 확인해 주세요. 다음 점검 때 다시 시도합니다.')

    R['checkedAt'] = TODAY.isoformat()
    json.dump(R, open(RULES_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(RULES_P, 'a').write('\n')
    S['seen'] = sorted(seen)[-500:]; S['lastRun'] = TODAY.isoformat()
    json.dump(S, open(STATE_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(STATE_P, 'a').write('\n')
    log(f'완료: 자동 반영 {len(safe)}건, 조회 실패 {len(failures)}건')

if __name__ == '__main__':
    main()
