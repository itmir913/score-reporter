import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {buildWorkbook} from './helpers/baseline-fixture.js';

/* jsdom 에는 canvas 가 없어 Chart.js 가 그리지 못한다 */
vi.mock('chart.js/auto', () => ({
    default: class {
        constructor(ctx, cfg) {
            this.cfg = cfg;
        }

        destroy() {
        }
    }
}));

const main = await import('../src/js/main.js');
const {SCHEMAS} = await import('../src/js/schema.js');
const rail = await import('../src/js/ui/examRail.js');
const {ST} = main;

/* 회차 여러 개를 올리고, 회차 레일로 고르고 옮기는 흐름을 실제 마크업 위에서 본다 */

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    HTMLCanvasElement.prototype.getContext = () => ({});
    window.scrollTo = () => {};
    ST.charts = {};
    main.clearAll();
    main.onExamsChanged(rail.renderExamRail);
});

const bytesOf = async (schema) => new Uint8Array(await buildWorkbook(schema).xlsx.writeBuffer());
const fakeFile = (name, bytes) => ({name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
/* 파일들을 표에 올리고 「불러오기」 한 번으로 회차로 넣는다 */
async function importFiles(...files) {
    await main.addUploads(files);
    main.commitImports();
}

const railKeys = () => [...document.querySelectorAll('#exam-rail .exam-chip-name')].map(b => b.textContent);

describe('회차 레일', () => {
    const put = (key) => {
        ST.activeExamKey = null;
        ST.exams = [...ST.exams];
        main.loadSampleData();
        rail.renderExamRail();
        // 샘플 회차 이름을 바꿔 여러 회차를 만든다
        vi.spyOn(window, 'prompt').mockReturnValueOnce(key);
        document.querySelector('#exam-rail [data-exam="샘플"] [aria-label="샘플 이름 바꾸기"]').click();
        vi.restoreAllMocks();
    };

    it('칩을 누르면 그 회차를 보고, ◀ ▶ 로 순서를 바꾼다', () => {
        put('사설');
        put('3');
        // 이름을 바꿔도 자리는 그대로다(나중에 넣은 「샘플」 자리 = 끝)
        expect(railKeys()).toEqual(['사설', '3']);
        document.querySelector('#exam-rail [aria-label="3 앞으로"]').click();
        expect(railKeys()).toEqual(['3', '사설']);
        [...document.querySelectorAll('#exam-rail .exam-chip-name')].find(b => b.textContent === '3').click();
        expect(ST.activeExamKey).toBe('3');
        expect(document.getElementById('report-subtitle').innerText).toContain('「3」 회차');
    }, 20000);

    it('회차를 지우면 남은 첫 회차를 본다', () => {
        put('3');
        put('4');
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        document.querySelector('#exam-rail [aria-label="3 지우기"]').click();
        vi.restoreAllMocks();
        expect(railKeys()).toEqual(['4']);
        expect(ST.activeExamKey).toBe('4');
    }, 20000);
});

describe('학생 표', () => {
    it('지금 회차의 학생을 보이고, 행을 누르면 성적표를 연다', async () => {
        await importFiles(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        const rows = [...document.querySelectorAll('#student-grid [data-grid="body"] tr[data-sid]')];
        expect(rows.length).toBe(13);
        expect(document.querySelector('#student-grid [data-grid="count"]').textContent).toBe('13명');
        rows[0].click();
        expect(document.getElementById('modal-student-info').innerText).toContain('성적표');
    }, 20000);
});

it('불러올 수 있는 진학 프로그램과 내려받는 경로를 목록으로 보인다', () => {
    const items = [...document.querySelectorAll('#tab-upload li .font-semibold')].map(n => n.textContent);
    expect(items).toEqual(['대교협', '유니브', '김영일', '꿈꾸GO']);
});

it('처음 열면 보이는 화면(파일 추가)의 탭이 켜져 있다', () => {
    const visible = ['upload', 'report', 'trend', 'export'].filter(t => !document.getElementById(`tab-${t}`).classList.contains('hidden'));
    expect(visible).toEqual(['upload']);
    expect([...document.querySelectorAll('.tab-btn.active')].map(b => b.dataset.tab)).toEqual(['upload']);
});

it('회차가 없으면 보고서 인쇄 단추를 감추고, 불러오면 보인다', async () => {
    const {renderReport} = await import('../src/js/report.js');
    renderReport();
    expect(document.getElementById('report-print').classList.contains('hidden')).toBe(true);
    main.loadSampleData();
    expect(document.getElementById('report-print').classList.contains('hidden')).toBe(false);
}, 20000);
