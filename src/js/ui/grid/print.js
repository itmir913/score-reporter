import {cellText} from '../table.js';
import {fontFaces, openPopup} from '../popup.js';

/* ───────────────────────────────────────────
   § 학생 표 인쇄: 빈 팝업에 지금 조건에 맞는 전체 행을 장식 없는 표로 그린다
   보고서 인쇄(report/report-print.js)와 같은 방식이다. 화면 표는 쪽을 나누고 보이는 행만
   그리므로(가상 스크롤) DOM 을 복사하지 않고, 행 자료·열 정의·셀 글자(cellText)로 새로 짠다.
   셀 값은 모두 글자 노드로 넣는다(엑셀 값에 < 가 있어도 태그가 되지 않는다).
   팝업은 메모리에서 만든 문서라 성적이 파일이나 저장소에 남지 않는다(CLAUDE.md).
─────────────────────────────────────────── */

const STYLE = `
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 9pt; color: #1e293b; background: #e2e8f0; }
  .toolbar { position: sticky; top: 0; display: flex; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; }
  .toolbar button { padding: 7px 22px; font: inherit; font-size: 13px; border: none; border-radius: 6px; cursor: pointer; color: #fff; background: #2563eb; }
  .toolbar button.close { background: #64748b; }
  .paper { margin: 16px auto; padding: 12mm 10mm; max-width: 297mm; background: #fff; box-shadow: 0 2px 12px rgba(15, 23, 42, .15); }
  h1 { font-size: 14pt; color: #1e3a8a; }
  p.meta { margin: 4px 0 10px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; white-space: nowrap; }
  th { background: #f1f5f9; font-weight: 700; text-align: center; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  @media print {
    body { background: none; }
    .toolbar { display: none; }
    .paper { margin: 0; padding: 0; max-width: none; box-shadow: none; }
  }
`;

/**
 * @param {{title: string, meta: string, rows: object[], registry: object[], columns: string[]}} options
 * @returns {boolean} 팝업을 열었는지
 */
export function printRows({title, meta, rows, registry, columns}) {
    // 팝업 차단을 피하려고 클릭 직후 바로 연다
    const pw = openPopup('width=1100,height=900');
    if (!pw) return false;
    const doc = pw.document;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title></title></head><body></body></html>');
    doc.close();
    doc.title = title;
    const style = doc.createElement('style');
    // 보고서 인쇄와 같은 글꼴(Pretendard)을 싣는다
    style.textContent = fontFaces() + STYLE;
    doc.head.append(style);

    const make = (tag, text, className) => {
        const node = doc.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };

    // 팝업 자신의 print/close 만 부른다
    const bar = make('div', undefined, 'toolbar');
    const printButton = make('button', '인쇄');
    printButton.addEventListener('click', () => pw.print());
    const closeButton = make('button', '닫기', 'close');
    closeButton.addEventListener('click', () => pw.close());
    bar.append(printButton, closeButton);

    const fields = new Map(registry.map(f => [f.key, f]));
    const table = make('table');
    const head = make('thead');
    const headRow = make('tr');
    for (const key of columns) headRow.append(make('th', fields.get(key)?.label ?? key));
    head.append(headRow);
    const body = make('tbody');
    for (const row of rows) {
        const tr = make('tr');
        for (const key of columns) {
            const field = fields.get(key);
            tr.append(make('td', cellText(key, row[key], field), field?.numeric ? 'num' : undefined));
        }
        body.append(tr);
    }
    table.append(head, body);

    const paper = make('main', undefined, 'paper');
    paper.append(make('h1', title), make('p', meta, 'meta'), table);
    doc.body.append(bar, paper);
    return true;
}
