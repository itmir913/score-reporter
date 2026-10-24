import Chart from 'chart.js/auto';
import {ST} from '../main.js';
import {DEFAULT_ANALYSIS, globalReportBasis} from '../report.js';
import {escapeAttr} from '../utils.js';
import {fontFaces, openPopup} from '../ui/popup.js';

/* ───────────────────────────────────────────
   § 보고서 PDF 인쇄: 빈 팝업에 인쇄용 보고서를 새로 짠다
   화면 레이아웃(선택 상자·버튼·sticky 바·스크롤 상자)을 인쇄 CSS로 숨기며 맞추던 방식을 버린다.
   지금 화면에 그려진 표와 차트를 그대로 가져와 장식 없는 문서로 다시 조립하므로, 화면에서 선택한
   기준(원점수·표시 인원·급간·수능최저 과목)이 보고서에 그대로 나온다.
   쪽 나눔은 강제로 하지 않는다. 표의 행·차트·지표 묶음이 쪽 경계에서 잘리지 않게만 하고,
   제목은 다음 내용과 떨어지지 않게 한다. 긴 표는 쪽마다 헤더가 다시 나온다.
   팝업은 메모리에서 만든 문서라 성적이 파일이나 저장소에 남지 않는다(CLAUDE.md).
─────────────────────────────────────────── */

const BASIS_LABEL = {raw: '원점수', std: '표준점수', pct: '백분위'};
const KEEP_ATTRS = new Set(['colspan', 'rowspan']);

/** 화면 표를 장식 없는 표로 옮긴다. 클래스·이벤트 속성·아이콘을 걷어 낸다 */
export function cleanTable(table) {
    if (!table) return '';
    const copy = table.cloneNode(true);
    copy.querySelectorAll('i, .no-print, select, input').forEach(el => el.remove());
    // 명단을 여는 단추(급간 인원 등)는 숫자만 남긴다
    copy.querySelectorAll('button').forEach(el => el.replaceWith(el.textContent.trim()));
    [copy, ...copy.querySelectorAll('*')].forEach(el => {
        [...el.attributes].forEach(a => { if (!KEEP_ATTRS.has(a.name)) el.removeAttribute(a.name); });
    });
    return copy.outerHTML;
}

/** 화면 차트를 같은 설정으로 고정 크기 캔버스에 다시 그려 그림으로 만든다(화면 크기·숨김과 무관하게 선명하게) */
function chartImage(canvas, width, height) {
    const src = canvas && Chart.getChart?.(canvas);
    // chart.config 의 type·data·options·plugins 는 Chart.js 가 공개하는 원래 설정이다
    const raw = src?.config;
    if (!raw?.type) return '';
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    host.appendChild(target);
    document.body.appendChild(host);
    let url = '';
    try {
        const chart = new Chart(target, {
            // data 를 원본 차트와 나눠 쓰지 않게 얕게 복사한다(Chart.js 는 배열에 감시자를 건다)
            type: raw.type, plugins: raw.plugins,
            data: {...raw.data, labels: [...(raw.data.labels ?? [])], datasets: raw.data.datasets.map(d => ({...d, data: [...d.data]}))},
            options: {...raw.options, responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 2, onClick: null},
        });
        url = target.toDataURL('image/png');
        chart.destroy();
    } catch (e) {
        console.error('차트를 그림으로 바꾸지 못했습니다.', e);
    } finally {
        host.remove();
    }
    return url ? `<img src="${url}" alt="">` : '';
}

const text = (id) => document.getElementById(id)?.textContent.trim() ?? '';
const tableOf = (id) => document.getElementById(id)?.closest('table');
const note = (id) => (text(id) ? `<p class="note">${escapeAttr(text(id))}</p>` : '');

const section = (title, body) => (body ? `<section><h2>${escapeAttr(title)}</h2>${body}</section>` : '');

/** 인쇄용 보고서 HTML. 화면에 그려진 결과를 읽어 조립한다 */
export function buildReportHtml() {
    const title = text('report-title') || '모의고사 성적 분석 레포트';
    const analysisEl = document.getElementById('report-analysis');
    // 화면에 적은 줄바꿈 그대로(report.js 도 innerText 로 적어 둔다)
    const analysis = (analysisEl?.innerText ?? analysisEl?.textContent ?? '').trim();
    const basis = BASIS_LABEL[globalReportBasis];

    const stats = [...document.querySelectorAll('#stat-cards .stat-card')].map(card => {
        const [label, value] = card.querySelectorAll(':scope > span');
        return `<div class="tile"><span>${escapeAttr(label?.textContent.trim())}</span><b>${escapeAttr(value?.textContent.trim())}</b></div>`;
    }).join('');

    const pie = (heading, canvasId, statsId) => {
        const table = cleanTable(document.querySelector(`#${statsId} table`));
        if (!table) return '';
        return `<div class="pie keep"><h3>${heading}</h3><div class="pie-body">${chartImage(document.getElementById(canvasId), 300, 300)}${table}</div></div>`;
    };

    const subjectCharts = [...document.querySelectorAll('#chart-grid > div')].map(card => {
        const name = card.querySelector('p span')?.textContent.replace(/\s+/g, ' ').trim();
        const total = card.querySelector('p span:last-child')?.textContent.trim();
        const img = chartImage(card.querySelector('canvas'), 640, 420);
        return img ? `<figure class="keep"><figcaption>${escapeAttr(name)}<small>${escapeAttr(total)}</small></figcaption>${img}</figure>` : '';
    }).join('');

    const distTable = cleanTable(tableOf('score-dist-thead'));

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeAttr(title.replace(/\s+/g, ' '))}</title>
<style>
${fontFaces()}
  @page { size: A4 portrait; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.5; background: #e2e8f0; }
  .toolbar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; }
  .toolbar button { padding: 7px 22px; font: inherit; font-size: 13px; border: none; border-radius: 6px; cursor: pointer; color: #fff; background: #2563eb; }
  .toolbar button.close { background: #64748b; }
  .paper { width: 210mm; margin: 16px auto; padding: 14mm 12mm 16mm; background: #fff; box-shadow: 0 2px 12px rgba(15, 23, 42, .15); }
  header { border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; }
  header h1 { white-space: pre-line; font-size: 20pt; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px; line-height: 1.25; }
  header p { margin-top: 6px; color: #64748b; font-size: 9.5pt; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; break-inside: avoid; }
  .tile { border: 1px solid #cbd5e1; border-radius: 4px; padding: 7px 8px; text-align: center; }
  .tile span { display: block; font-size: 8.5pt; color: #64748b; }
  .tile b { display: block; font-size: 14pt; color: #0f172a; }
  .analysis { white-space: pre-line; border-left: 3px solid #1e3a8a; background: #f8fafc; padding: 8px 12px; margin-bottom: 14px; }
  section { margin-top: 16px; }
  h2 { font-size: 12.5pt; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 8px; break-after: avoid; counter-increment: sec; }
  h2::before { content: counter(sec) ". "; }
  body { counter-reset: sec; }
  h3 { font-size: 10.5pt; font-weight: 700; margin-bottom: 4px; break-after: avoid; }
  .note { font-size: 8.5pt; color: #b45309; margin: 2px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: center; vertical-align: middle; }
  th { background: #f1f5f9; font-weight: 700; }
  td div { display: flex; flex-direction: column; }
  td div span + span { font-size: 7.5pt; color: #64748b; }
  img { display: block; max-width: 100%; height: auto; }
  .keep { break-inside: avoid; }
  .dist-table tr:nth-child(odd) td { background: #f1f5f9; font-weight: 700; }
  .dist-table td:first-child { font-weight: 700; white-space: nowrap; }
  .dist img { max-height: 70mm; margin: 0 auto 6px; }
  .pie { margin-bottom: 10px; }
  .pie-body { display: grid; grid-template-columns: 52mm 1fr; gap: 8px; align-items: center; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px; }
  figcaption { display: flex; justify-content: space-between; font-weight: 700; font-size: 9pt; margin-bottom: 4px; }
  figcaption small { font-weight: 400; color: #64748b; }
  footer { margin-top: 18px; font-size: 8pt; color: #94a3b8; text-align: center; }
  @media print {
    body { background: none; }
    .toolbar { display: none; }
    .paper { width: auto; margin: 0; padding: 0; box-shadow: none; }
  }
</style>
</head>
<body>
<!-- 팝업 자신의 print/close 만 부른다. 이 문서에는 앱 스크립트가 없다 -->
<div class="toolbar"><button onclick="window.print()">인쇄</button><button class="close" onclick="window.close()">닫기</button></div>
<main class="paper">
<header>
  <h1>${escapeAttr(title)}</h1>
  <p>${escapeAttr(`「${ST.activeExamKey ?? ''}」 회차 · 총 ${ST.data?.length ?? 0}명`)}${basis ? ` · 통계 기준 ${escapeAttr(basis)}` : ''} · ${escapeAttr(text('print-date-top'))}</p>
</header>
${stats ? `<div class="tiles">${stats}</div>` : ''}
${note('basis-missing-note')}
${analysis && analysis !== DEFAULT_ANALYSIS.trim() ? `<div class="analysis keep">${escapeAttr(analysis)}</div>` : ''}
${section(text('top-n-title') || '상위 학생 명단', note('top-n-note') + cleanTable(tableOf('top20-thead')))}
${section(text('dist-title') || '총점 급간별 인원 분포', distTable && `${note('dist-note')}<div class="dist keep">${chartImage(document.getElementById('score-dist-chart'), 820, 330)}</div><div class="dist-table">${distTable}</div>`)}
${section('선택과목 비율 분석', pie('국어 선택 비율', 'kor-select-chart', 'kor-select-stats') + pie('수학 선택 비율', 'math-select-chart', 'math-select-stats') + pie('탐구 선택 비율', 'inq-select-chart', 'inq-select-stats'))}
${section(text('csat-title') || '수능 최저학력기준 충족 분석', cleanTable(tableOf('csat-summary-thead')) && `<h3>학년 전체 최저학력기준 충족 (누적 인원)</h3>${cleanTable(tableOf('csat-summary-thead'))}`)}
${section('과목별 성적 분포 종합', subjectCharts && `<div class="grid">${subjectCharts}</div>`)}
<footer>${escapeAttr(title.replace(/\s+/g, ' '))}</footer>
</main>
</body>
</html>`;
}

/** 「보고서 PDF 인쇄」: 팝업을 먼저 띄우고, 그 안에서 인쇄한다 */
export function openReportPrint() {
    if (!ST.data?.length) return;
    // 팝업 차단을 피하려고 클릭 직후 바로 연다. 내용은 그 다음에 채운다
    const pw = openPopup('width=900,height=1000');
    if (!pw) return;
    pw.document.write(buildReportHtml());
    pw.document.close();
}
