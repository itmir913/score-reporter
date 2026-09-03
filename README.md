# 모의고사 성적 분석 시스템 (score-reporter)

> 모의고사 성적 파일을 불러와 과목별·학급별 통계, 상위권 분포, 수능 최저 충족 인원 등을 시각화하고 리포트로 내보내는 웹 앱입니다.

🔗 **서비스 주소**: [https://luminousky.com/teacher-utility-kit/score-reporter/](https://luminousky.com/teacher-utility-kit/score-reporter/)

이 저장소는 [teacher-utility-kit](https://github.com/itmir913/teacher-utility-kit)의 `score-reporter` 폴더를 커밋 이력째 분리한 것입니다. 초기 이름이던 `grade_manager` 시절(2026-03-25 초안)부터의 이력을 모두 담고 있습니다.

---

## 구성

빌드 단계가 없는 정적 사이트입니다. 저장소 뿌리가 곧 배포 대상입니다.

| 경로 | 내용 |
| --- | --- |
| `index.html` | 단일 페이지 앱의 마크업. 스크립트와 스타일을 모두 상대 경로로 불러옵니다. |
| `js/` | `main.js`(진입), `parser.js`(성적 파일 파싱), `schema.js`(데이터 스키마), `exporter.js`(내보내기), `report.js`와 `js/report/*`(리포트 렌더링) |
| `css/style.css` | 앱 고유 스타일과 Pretendard 폰트 선언 |
| `dist/tailwind.css` | Tailwind CSS 빌드 산출물. **커밋 대상**입니다. |
| `lib/` | 내장한 외부 라이브러리: Chart.js 4.4.0, ExcelJS, SheetJS(xlsx 0.20.0), buffer 6.0.3, Font Awesome 6.4.0, Pretendard 폰트 |
| `webfonts/` | Font Awesome 웹폰트 |
| `docs/` | 사용 설명서 (PDF, HWPX) |

## 로컬에서 실행

정적 서버로 저장소 뿌리를 띄우면 됩니다.

```bash
npx serve . -p 5500
```

또는

```bash
python -m http.server 5500
```

## Tailwind CSS 다시 빌드하기

`dist/tailwind.css`는 teacher-utility-kit의 `build/build-tailwind.js`가 만든 산출물입니다. 그 스크립트는 `.tw` 마커 파일이 있는 앱 폴더를 찾아 아래와 같은 명령을 실행했습니다. (`input.css`는 `@tailwind base; @tailwind components; @tailwind utilities;` 세 줄입니다.)

```bash
npx tailwindcss@3.4 -i input.css -o dist/tailwind.css --content "**/*.{html,js}" --minify
```

이 저장소에는 아직 자체 빌드 스크립트가 없습니다. 뿌리의 `.tw` 파일은 그 스크립트용 마커라 여기서는 의미가 없으며, Vite 도입 시 빌드 방식과 함께 정리할 예정입니다.

## 배포

`.github/workflows/deploy-pages.yml`이 담당합니다. push로는 아무 일도 일어나지 않고, Actions 탭에서 직접 실행(workflow_dispatch)할 때에만 다음이 이루어집니다.

1. 저장소 뿌리를 GitHub Pages에 배포합니다.
2. 배포가 성공하면 저장소 전체를 `score-reporter.zip`으로 묶어 `latest` 릴리스에 올립니다.

저장소 설정이 **Settings → Pages → Source: GitHub Actions** 여야 합니다.

---

## 라이선스

[PolyForm Noncommercial License 1.0.0](LICENSE.md)

- **허용**: 개인적인 용도, 학교 등 교육기관에서의 비영리적 목적의 사용 및 배포
- **금지**: 본 프로그램이나 소스코드를 활용한 모든 종류의 상업적 영리 활동

© 2026 [luminousky.com](https://luminousky.com). All rights reserved.
