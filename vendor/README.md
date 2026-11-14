# 외부 라이브러리 (자체 호스팅)
사용자 파일이 외부로 나가지 않도록, 변환에 쓰는 라이브러리를 이 사이트에서 직접 제공합니다.

| 폴더 | 라이브러리 | 버전 | 라이선스 |
|---|---|---|---|
| pdfjs/ | Mozilla pdf.js (pdfjs-dist) | 3.2.146 | Apache-2.0 (`pdfjs/LICENSE`) |
| tesseract/ | tesseract.js-core (Tesseract OCR WebAssembly) | 7.0.0 | Apache-2.0 (`tesseract/LICENSE`) |
| pdf-lib/ | pdf-lib (PDF 나누기·합치기) | 1.17.1 | MIT (`pdf-lib/LICENSE.md`) |
| tesseract/*.traineddata | tesseract-ocr/tessdata_fast (kor, eng) | — | Apache-2.0 (`tesseract/LICENSE-tessdata`) |

pdf-to-hwp의 HWPX 기본 틀은 python-hwpx(Apache-2.0, airmang) 저장소의 한컴 한글 저장 견본(`tests/fixtures/hancom_saved/cell_border_2x3_base.hwpx`)을 바탕으로 합니다.
