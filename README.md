# 모의고사 성적 분석 시스템 (score-reporter)

> 모의고사 성적 파일을 불러와 과목별·학급별 통계, 상위권 분포, 수능 최저학력기준 충족 인원 등을 시각화하고 리포트로 내보내는 웹 앱입니다.

성적 데이터는 브라우저 밖으로 나가지 않습니다. 파일 파싱부터 리포트 생성까지 전부 클라이언트에서 처리하며, 서버로 아무것도 전송하지 않습니다.

이 저장소는 [teacher-utility-kit](https://github.com/itmir913/teacher-utility-kit)의 `score-reporter` 폴더를 커밋 이력째 분리한 것입니다. 초기 이름이던 `grade_manager` 시절(2026-03-25 초안)부터의 이력을 담고 있습니다.

---

## 시작하기

```bash
npm ci
npm run dev
```

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | `dist/` 에 배포용 정적 파일 생성 |
| `npm run preview` | 빌드 결과를 로컬에서 확인 |
| `npm test` | Vitest 실행 |
| `npm run test:watch` | 파일 변경을 감시하며 테스트 |
| `npm run lint` | ESLint 실행 |

## 구조

```
index.html          단일 페이지 앱의 마크업. Vite의 진입 HTML이다.
src/
  main.js           진입점. 스타일과 앱 모듈을 불러오고, 인라인 핸들러용 전역을 노출한다.
  js/               앱 로직 (아래 표 참고)
  styles/
    main.css        스타일시트 로드 순서를 정하는 파일
    style.css       앱 고유 스타일
    tailwind.css    @tailwind 지시어
public/docs/        사용 설명서 (PDF, HWPX). 빌드하면 dist/docs/ 로 복사된다.
tests/              Vitest 테스트
vendor/             npm 레지스트리에서 받을 수 없는 의존성 (아래 참고)
```

| 파일 | 역할 |
| --- | --- |
| `src/js/main.js` | 앱 상태(`ST`), 파일 읽기, 탭 전환, 내보내기 |
| `src/js/parser.js` | 성적 파일 → 학생 레코드 |
| `src/js/schema.js` | 양식별 열 매핑 (`SCHEMAS`, `FormatSchema`) |
| `src/js/exporter.js` | 다른 양식으로 내보내기 |
| `src/js/report.js` | 리포트 렌더링 총괄, 통계 기준(원점수/표준점수/백분위) 상태 |
| `src/js/report/` | 통계·상위권·분포·선택과목·수능최저·모달 등 개별 렌더러 |
| `src/js/utils.js` | 공용 헬퍼 |

### 인라인 핸들러와 전역

HTML에 `onclick="switchTab('upload')"` 같은 인라인 핸들러가 남아 있습니다. 인라인 핸들러는 전역 스코프에서만 이름을 찾기 때문에, `src/main.js`가 해당 함수들을 `window`에 올려 줍니다. 어떤 이름이 필요한지는 그 파일에 모아 두었습니다. 인라인 핸들러를 `addEventListener`로 옮기면 이 전역 노출은 통째로 없앨 수 있습니다.

## 의존성

외부 라이브러리는 모두 npm으로 관리하며 빌드 시 번들에 포함됩니다. CDN을 실행 시점에 부르지 않습니다.

Chart.js, ExcelJS, SheetJS(xlsx), buffer, Font Awesome, Pretendard.

### xlsx 가 `vendor/` 에 있는 이유

SheetJS는 0.18.5 이후 npm 레지스트리에 게시하지 않습니다. 0.19.3에서 프로토타입 오염이, 0.20.2에서 ReDoS가 고쳐졌으므로 레지스트리에 남은 0.18.5로 내려가면 알려진 취약점을 그대로 안게 됩니다.

그래서 SheetJS 공식 배포본 `xlsx-0.20.3.tgz`를 `vendor/` 에 넣고 `file:` 의존성으로 참조합니다. 이렇게 하면 `npm ci` 가 네트워크 없이도 같은 결과를 냅니다. **`vendor/` 를 지우면 설치가 실패합니다.**

버전을 올리려면 [cdn.sheetjs.com](https://cdn.sheetjs.com/)에서 새 tarball을 받아 `vendor/`에 넣고 `package.json`의 경로를 바꾼 뒤 `npm install` 하면 됩니다.

## 배포

`.github/workflows/deploy-pages.yml` 이 담당합니다. **push로는 아무 일도 일어나지 않고**, Actions 탭에서 직접 실행(workflow_dispatch)할 때에만 다음이 순서대로 이루어집니다.

1. `npm ci` → `npm run lint` → `npm test` → `npm run build`
2. `dist/` 를 GitHub Pages에 배포
3. 배포가 성공하면 `dist/` 를 묶은 `score-reporter.zip` 을 `latest` 릴리스에 올림

저장소 설정이 **Settings → Pages → Source: GitHub Actions** 여야 합니다.

`.github/workflows/ci.yml` 은 push와 PR마다 lint·test·build만 돌리고 배포는 하지 않습니다.

### 오프라인 번들

릴리스의 `score-reporter.zip` 은 압축을 풀고 `index.html` 을 그대로 열면 동작합니다. 이를 위해 빌드가 두 가지를 지킵니다.

- 모든 경로가 상대 경로 (`base: './'`)
- 번들을 iife로 내보내고 `type="module"` 과 `crossorigin` 을 걷어냄

`file://` 은 출처가 `null` 이라 모듈 스크립트와 `crossorigin` 리소스가 CORS로 막힙니다. 이 두 가지가 지켜지지 않으면 압축을 풀어 열었을 때 빈 화면이 뜹니다. 자세한 내용은 `vite.config.js` 의 주석에 적어 두었습니다.

---

## 라이선스

[PolyForm Noncommercial License 1.0.0](LICENSE.md)

- **허용**: 개인적인 용도, 학교 등 교육기관에서의 비영리적 목적의 사용 및 배포
- **금지**: 본 프로그램이나 소스코드를 활용한 모든 종류의 상업적 영리 활동

번들에 포함되는 외부 라이브러리는 각자의 라이선스를 따릅니다.

© 2026 [luminousky.com](https://luminousky.com). All rights reserved.
