# 생활·업무 무료 도구 모음

설치 없이 브라우저에서 바로 쓰는 무료 웹 도구 모음입니다. 입력 내용과 사진은 서버로 전송되지 않습니다.

- 사이트: https://ilsangtool.github.io/tools/

| 도구 | 설명 | 바로가기 |
|---|---|---|
| 리뷰 운영정책 고지문 생성기 | 2026년 개정 전자상거래법 리뷰 공개 의무 대응. 질문 6개에 답하면 고지문과 HTML 코드가 완성됩니다. | [열기](https://ilsangtool.github.io/tools/review-policy/) |
| 환불·교환 규정 고지문 생성기 | 온라인 7일 청약철회 기준 반영. 법에 어긋나는 "세일 상품 환불 불가" 문구는 자동으로 걸러냅니다. | [열기](https://ilsangtool.github.io/tools/refund-policy/) |
| 예약·노쇼 규정 문구 생성기 | 2025.12 개정 노쇼 위약금 기준(20%·40%) 반영. 예약 확정 문자와 매장 공지를 한 번에. | [열기](https://ilsangtool.github.io/tools/noshow-policy/) |
| 휴무·임시휴업 안내문 만들기 | 날짜만 고르면 A4 인쇄용 안내문, SNS 이미지, 네이버 플레이스 공지 문구가 완성됩니다. | [열기](https://ilsangtool.github.io/tools/closed-notice/) |
| 알바 주휴수당·월급 계산기 | 2026년 10,320원 · 2027년 10,700원 반영. 주휴수당, 월급, 3.3%·4대보험 실수령액까지. | [열기](https://ilsangtool.github.io/tools/weekly-pay/) |
| 더치페이·모임 정산 계산기 | 1차·2차 결제자가 달라도 누가 누구에게 얼마 보내면 되는지 송금 횟수를 최소로 정리합니다. | [열기](https://ilsangtool.github.io/tools/dutch-pay/) |
| D-day·전역일·만나이 계산기 | 디데이, 100일·1000일 기념일, 날짜 더하기, 군 전역일, 만 나이를 한 화면에서. | [열기](https://ilsangtool.github.io/tools/date-calc/) |
| 사진 용량 줄이기·HEIC 변환 | 서버 업로드 없이 여러 장을 목표 용량(KB) 이하로 줄이고, 아이폰 HEIC를 JPG로 바꿉니다. | [열기](https://ilsangtool.github.io/tools/image-resize/) |
| 증명사진 규격 자르기 | 여권·반명함·비자 규격으로 자르고 편의점에서 뽑는 4×6 인화용 판까지 만듭니다. | [열기](https://ilsangtool.github.io/tools/id-photo/) |

## 구조
```
/                       도구 목록 (index.html)
/review-policy/        리뷰 운영정책 고지문 생성기
/refund-policy/        환불·교환 규정 고지문 생성기
/noshow-policy/        예약·노쇼 규정 문구 생성기
/closed-notice/        휴무·임시휴업 안내문 만들기
/weekly-pay/           알바 주휴수당·월급 계산기
/dutch-pay/            더치페이·모임 정산 계산기
/date-calc/            D-day·전역일·만나이 계산기
/image-resize/         사진 용량 줄이기·HEIC 변환
/id-photo/             증명사진 규격 자르기
robots.txt, sitemap.xml   검색엔진 등록용
```

새 도구는 폴더를 하나 추가하고 `index.html` 목록, `sitemap.xml`, 이 README 표에 함께 등록합니다.

## 법령 기준값 자동 반영
법이 바뀌는 값은 도구 코드가 아니라 `data/rules.json` 한 곳에 있습니다. 도구는 열릴 때마다 이 파일을 읽어서 **시행일(`from`)이 지난 값을 자동으로** 씁니다.

| 항목 | 쓰는 도구 | 자동 갱신 방식 |
|---|---|---|
| 최저시급 | weekly-pay | 뉴스 교차확인(언론사 2곳 이상 일치 + 정상 범위) → 자동 반영 + 이슈 알림 |
| 건강·장기요양·고용보험료율 | weekly-pay | 위와 같음 |
| 국민연금 보험료율 | weekly-pay | 2033년까지 법정 단계 인상표 미리 입력 → 매년 1월 1일 자동 전환. 개정 보도 시 이슈 알림 |
| 노쇼 위약금 상한 | noshow-policy | 개정 보도 시 이슈 알림 → `rules.json`에 새 시행일 항목 추가 |
| 청약철회 기간 등 | refund-policy | 위와 같음 |
| 군 복무기간 | date-calc | 위와 같음 |
| 주휴수당 조건 | weekly-pay | 위와 같음 |

- 점검: `.github/workflows/law-watch.yml`, 매주 월·목 오전 9시(한국시간). Actions 탭 → **Run workflow**로 바로 실행할 수도 있습니다.
- 점검 뒤 `_build/build.py`가 페이지 제목·설명(검색 노출 문구)도 새 값으로 다시 만듭니다.
- 선택: 저장소 Settings → Secrets → Actions에 `LAW_OC`(국가법령정보센터 Open API 인증값)를 넣으면 관련 법령 10개의 시행일 변경도 감지합니다.
- 페이지 원본은 `_build/tools/<도구>/`에 있습니다. 직접 고칠 때는 원본을 고치고 `python _build/build.py`를 실행하세요. 결과 `index.html`을 직접 고치면 다음 자동 점검 때 덮어써집니다.
