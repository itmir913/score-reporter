import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

/* jsdom 에는 canvas 가 없어 Chart.js 가 그리지 못한다. 넘겨받은 설정만 보관한다(차트 그림은 빠진다). */
vi.mock('chart.js/auto', () => ({
    default: class {
        constructor(ctx, cfg) {
            this.cfg = cfg;
        }

        destroy() {
        }
    }
}));

const {ST} = await import('../src/js/main.js');
const {renderAll, DEFAULT_ANALYSIS} = await import('../src/js/report.js');
const {buildReportHtml, cleanTable, openReportPrint} = await import('../src/js/report/report-print.js');

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    HTMLCanvasElement.prototype.getContext = () => ({});
    ST.charts = {};
});

const score = (subject, raw, grade) => ({subject, raw, std: raw + 50, pct: raw, grade, common_raw: null, select_raw: null});
const student = (name, number, raw) => ({
    name, class: '1', number: String(number), student_id: '',
    korean: score('화법과 작문', raw, 2), math: score('미적분', raw, 3),
    english: {raw: null, std: null, pct: null, grade: 2},
    inquiry1: score('물리학Ⅰ', 40, 1), inquiry2: score('화학Ⅰ', 30, 4),
    hist: {raw: null, std: null, pct: null, grade: 1},
    fl2: {subject: '', raw: null, std: null, pct: null, grade: null},
});

const reportDoc = () => new DOMParser().parseFromString(buildReportHtml(), 'text/html');

describe('보고서 인쇄 팝업', () => {
    it('화면의 표를 장식 없이 옮긴다', () => {
        ST.data = [student('가', 1, 90), student('나', 2, 80)];
        renderAll();
        const doc = reportDoc();
        expect(doc.querySelectorAll('table [class], table [data-action]')).toHaveLength(0);
        expect(doc.querySelectorAll('h2').length).toBeGreaterThanOrEqual(4);
        expect(doc.body.textContent).toContain('가');
    });

    it('급간 인원처럼 단추로 된 숫자도 남긴다', () => {
        ST.data = [student('가', 1, 90), student('나', 2, 80)];
        renderAll();
        const counts = [...reportDoc().querySelectorAll('.dist-table td')].map(td => td.textContent.trim());
        expect(counts.filter(c => c === '1').length).toBeGreaterThanOrEqual(2);
    });

    it('작성 가이드 그대로인 종합 분석은 싣지 않고, 고쳐 쓴 글은 싣는다', () => {
        ST.data = [student('가', 1, 90)];
        renderAll();
        document.getElementById('report-analysis').textContent = DEFAULT_ANALYSIS;
        expect(reportDoc().querySelector('.analysis')).toBeNull();
        document.getElementById('report-analysis').textContent = '국어가 어려웠다';
        expect(reportDoc().querySelector('.analysis').textContent).toBe('국어가 어려웠다');
    });

    it('강제 쪽 나눔을 쓰지 않는다', () => {
        ST.data = [student('가', 1, 90)];
        renderAll();
        expect(buildReportHtml()).not.toMatch(/break-(before|after)\s*:\s*(page|always)/);
    });

    it('인쇄 단추는 팝업을 먼저 띄우고 보고서를 쓴다', () => {
        ST.data = [student('가', 1, 90)];
        renderAll();
        const write = vi.fn();
        const open = vi.spyOn(window, 'open').mockReturnValue({document: {write, close: vi.fn()}});
        openReportPrint();
        expect(open).toHaveBeenCalledOnce();
        expect(write.mock.calls[0][0]).toContain('<!DOCTYPE html>');
        open.mockRestore();
    });

    it('cleanTable 은 colspan 만 남긴다', () => {
        const t = document.createElement('table');
        t.innerHTML = '<tr class="x" data-action="y"><td colspan="2" class="z"><i></i><button>3</button></td></tr>';
        expect(cleanTable(t)).toBe('<table><tbody><tr><td colspan="2">3</td></tr></tbody></table>');
    });
});
