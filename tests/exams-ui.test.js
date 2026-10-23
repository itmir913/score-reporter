import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {zipSync} from 'fflate';
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
    ST.queue = [];
    main.clearFile();
    ST.data = null;
    main.onExamsChanged(rail.renderExamRail);
});

const bytesOf = async (schema) => new Uint8Array(await buildWorkbook(schema).xlsx.writeBuffer());
const fakeFile = (name, bytes) => ({name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
// 다음 파일은 기다리지 않고 띄운다(processFile 이 50ms 쉬고 읽는다). 뜰 때까지 기다린다
const settle = async (name) => {
    for (let i = 0; i < 100 && (name ? ST.file?.name !== name : false); i++) await new Promise(r => setTimeout(r, 20));
    await new Promise(r => setTimeout(r, 20));
};
const railKeys = () => [...document.querySelectorAll('#exam-rail .exam-chip-name')].map(b => b.textContent);

describe('여러 파일을 회차로', () => {
    it('zip 안의 엑셀 둘을 차례로 확인해 각각 회차로 넣는다. 양식은 파일마다 따로 맞춘다', async () => {
        const zip = zipSync({'2026-03 학평.xlsx': await bytesOf(SCHEMAS.univcoop), '2026-04 학평.xlsx': await bytesOf(SCHEMAS.kimyoungil)});
        await main.processFiles([fakeFile('모의고사.zip', zip)]);
        await settle('2026-03 학평.xlsx');

        expect(ST.file.name).toBe('2026-03 학평.xlsx');
        expect(ST.fmtId).toBe('univcoop');
        expect(document.getElementById('exam-key-input').value).toBe('2026-03');
        expect(document.getElementById('queue-note').textContent).toContain('1개 더');
        main.parseData();
        await settle('2026-04 학평.xlsx');

        // 다음 파일이 이어서 뜬다
        expect(ST.file.name).toBe('2026-04 학평.xlsx');
        expect(ST.fmtId).toBe('kimyoungil');
        main.parseData();
        await settle();

        expect(ST.exams.map(e => [e.key, e.formatId, e.students.length])).toEqual([
            ['2026-03', 'univcoop', 13], ['2026-04', 'kimyoungil', 13],
        ]);
        expect(ST.exams.every(e => /^[0-9a-f]{64}$/.test(e.fileHash))).toBe(true);
        expect(railKeys()).toEqual(['2026-03', '2026-04']);
        expect(ST.activeExamKey).toBe('2026-04');
    });

    it('회차 이름이 겹치면 넣지 않고 알린다', async () => {
        await main.processFile(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        main.parseData();
        await main.processFile(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        main.parseData();
        expect(ST.exams).toHaveLength(1);
        expect(document.getElementById('toast-msg').innerText).toContain('「3」 회차가 이미 있습니다');
        // 이름을 고치면 들어간다
        document.getElementById('exam-key-input').value = '3월 재시험';
        main.parseData();
        expect(ST.exams.map(e => e.key)).toEqual(['3', '3월 재시험']);
    });

    it('건너뛰기를 누르면 그 파일은 넣지 않고 다음 파일로 간다', async () => {
        const zip = zipSync({'a.xlsx': await bytesOf(SCHEMAS.univcoop), 'b.xlsx': await bytesOf(SCHEMAS.kkumkugo)});
        await main.processFiles([fakeFile('x.zip', zip)]);
        await settle('a.xlsx');
        main.skipFile();
        await settle('b.xlsx');
        expect(ST.file.name).toBe('b.xlsx');
        expect(ST.exams).toEqual([]);
    });
});

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
        await main.processFile(fakeFile('2026-03.xlsx', await bytesOf(SCHEMAS.univcoop)));
        main.parseData();
        await main.processFile(fakeFile('사설.xlsx', await bytesOf(SCHEMAS.kimyoungil)));
        main.parseData();
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
        await main.processFile(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        main.parseData();
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
        await main.processFile(fakeFile('3월.xlsx', await bytesOf(SCHEMAS.univcoop)));
        main.parseData();
        const rows = [...document.querySelectorAll('#student-grid [data-grid="body"] tr[data-sid]')];
        expect(rows.length).toBe(13);
        expect(document.querySelector('#student-grid [data-grid="count"]').textContent).toBe('13명');
        rows[0].click();
        expect(document.getElementById('modal-student-info').innerText).toContain('성적표');
    });
});
