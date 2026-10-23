import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import ExcelJS from 'exceljs';
import {buildWorkbook} from './helpers/baseline-fixture.js';

/* 마이그레이션 단계 0 기준선.
 * 지금 앱이 5종 양식을 읽고, 통계·순위를 매기고, 내보내는 결과를 스냅숏으로 묶는다.
 * 재작성 뒤 이 스냅숏이 바뀌면, 의도한 변경(탐구평균 등)인지 퇴행인지를 하나씩 검토한다.
 * 가상 학생만 쓴다(tests/helpers/baseline-fixture.js). */

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
const {renderAll, setGlobalBasis} = await import('../src/js/report.js');
const {GradeDataParser} = await import('../src/js/parser.js');
const {GradeExporter} = await import('../src/js/exporter.js');
const {SCHEMAS} = await import('../src/js/schema.js');

const FORMATS = Object.keys(SCHEMAS);

const parsed = {};
beforeAll(async () => {
    for (const id of FORMATS) {
        // 한 번 저장했다가 다시 읽어, 실제 파일을 올렸을 때와 같은 셀 값 모양을 얻는다
        const buf = await buildWorkbook(SCHEMAS[id]).xlsx.writeBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        parsed[id] = new GradeDataParser(SCHEMAS[id]).parse(wb, '성적');
    }
});

it('5종 양식을 모두 다룬다', () => {
    expect(FORMATS).toEqual(['daegyohyeop', 'daegyohyeop_preview', 'univcoop', 'kimyoungil', 'kkumkugo']);
});

describe.each(FORMATS)('읽기: %s', (id) => {
    it('레코드', () => {
        expect(parsed[id]).toMatchSnapshot();
    });
});

const cellTexts = (tbodyId) => [...document.getElementById(tbodyId).querySelectorAll('tr')]
    .map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()));

describe.each(FORMATS)('리포트: %s', (id) => {
    beforeEach(() => {
        document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
            .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
        HTMLCanvasElement.prototype.getContext = () => ({});
        ST.charts = {};
    });

    it.each(['raw', 'std', 'pct'])('기준 %s', (basis) => {
        ST.data = parsed[id];
        document.getElementById('top-n-count').value = 'all';
        document.getElementById('csat-top-n-count').value = 'all';
        setGlobalBasis(basis);
        renderAll();
        expect({
            statCards: document.getElementById('stat-cards').textContent.replace(/\s+/g, ' ').trim(),
            topN: cellTexts('top20-tbody'),
            scoreDist: ST.charts.scoreDist?.cfg.data ?? null,
            csatSchool: cellTexts('csat-school-tbody'),
            csatSummary: cellTexts('csat-summary-tbody'),
        }).toMatchSnapshot();
    });
});

/* 내보내기는 dlBlob 으로 내려받는다. 그 Blob 을 가로채 다시 읽는다 (exporter.test.js 와 같은 방식). */
async function exportAndRead(students, target) {
    let captured = null;
    vi.stubGlobal('URL', {
        createObjectURL: (blob) => {
            captured = blob;
            return 'blob:test';
        },
        revokeObjectURL: () => {
        },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    });
    await GradeExporter.toXlsx(students, target, '성적.xlsx');
    click.mockRestore();
    vi.unstubAllGlobals();

    const buffer = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = () => rej(reader.error);
        reader.readAsArrayBuffer(captured);
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const rows = [];
    wb.getWorksheet('성적데이터').eachRow({includeEmpty: true}, (row) => {
        const cells = [];
        row.eachCell({includeEmpty: true}, (cell, i) => {
            cells[i - 1] = cell.value ?? '';
        });
        rows.push(cells);
    });
    return rows;
}

describe('내보내기', () => {
    afterAll(() => vi.restoreAllMocks());

    // 읽은 양식 그대로 다시 내보낸다(5종), 그리고 대교협으로 읽은 자료를 나머지 양식으로도 내보낸다
    it.each(FORMATS)('%s → 같은 양식', async (id) => {
        expect(await exportAndRead(parsed[id], SCHEMAS[id])).toMatchSnapshot();
    });

    it.each(FORMATS)('daegyohyeop → %s', async (id) => {
        expect(await exportAndRead(parsed.daegyohyeop, SCHEMAS[id])).toMatchSnapshot();
    });
});
