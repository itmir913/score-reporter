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

describe('프로젝트 파일', () => {
    it('저장한 파일을 열면 모든 회차와 순서·옵션이 돌아온다', async () => {
        await importFiles(fakeFile('2026-03.xlsx', await bytesOf(SCHEMAS.univcoop)), fakeFile('사설.xlsx', await bytesOf(SCHEMAS.kimyoungil)));
        document.getElementById('include-no-inquiry').checked = true;

        let saved = null;
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.stubGlobal('URL', {createObjectURL: (b) => { saved = b; return 'blob:x'; }, revokeObjectURL: () => {}});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        rail.saveProject();
        vi.unstubAllGlobals();
        const text = await new Promise(r => {
            const fr = new FileReader();
            fr.onload = () => r(fr.result);
            fr.readAsText(saved);
        });

        main.clearAll();
        document.getElementById('include-no-inquiry').checked = false;
        await rail.openProject({text: async () => text});
        vi.restoreAllMocks();
        expect(ST.exams.map(e => e.key)).toEqual(['2026-03', '사설']);
        expect(document.getElementById('include-no-inquiry').checked).toBe(true);
        expect(railKeys()).toEqual(['2026-03', '사설']);
    }, 20000);

    it('저장 전에 개인정보 경고를 보여 주고, 취소하면 저장하지 않는다', async () => {
        await importFiles(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        rail.saveProject();
        expect(ask.mock.calls[0][0]).toContain('학생 이름과 성적');
        expect(click).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });
});

describe('학생 표', () => {
    it('지금 회차의 학생을 보이고, 행을 누르면 성적표를 연다', async () => {
        await importFiles(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        const rows = [...document.querySelectorAll('#student-grid [data-grid="body"] tr[data-sid]')];
        expect(rows.length).toBe(13);
        expect(document.querySelector('#student-grid [data-grid="count"]').textContent).toBe('13명');
        rows[0].click();
        expect(document.getElementById('modal-student-info').innerText).toContain('성적표');
    });
});
