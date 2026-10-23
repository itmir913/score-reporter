import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import ExcelJS from 'exceljs';
import {zipSync} from 'fflate';
import * as XLSX from 'xlsx';
import {addUploads, clearAll, commitImports, IMPORT, loadSampleData, renderImports, ST} from '../src/js/main.js';
import {showStudentDetail} from '../src/js/report/report-modal.js';
import {renderSubjectsCharts} from '../src/js/report/report-render-chart-subjects.js';
import {SCHEMAS} from '../src/js/schema.js';
import {blockers, prepareUploads, unlock} from '../src/js/ui/importer.js';
import {buildWorkbook} from './helpers/baseline-fixture.js';
import {encryptAgile, toContainer} from './helpers/office-encrypt.js';

/* 「파일 추가」: 여러 파일을 한 표에 늘어놓고 한 번에 불러오는 흐름을 실제 마크업 위에서 본다. */

beforeAll(() => {
    if (!globalThis.crypto?.subtle) globalThis.crypto = crypto.webcrypto;
});

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    HTMLCanvasElement.prototype.getContext = () => ({});
    window.scrollTo = () => {};
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearAll();
    vi.restoreAllMocks();
});

// jsdom 의 File 에는 arrayBuffer() 가 없어서 쓰는 부분만 대신 만든다
const fakeFile = (name, data) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return {name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
};
const xlsxOf = async (schema) => new Uint8Array(await buildWorkbook(schema).xlsx.writeBuffer());
const row = (i = 0) => IMPORT.rows[i];
const tableText = () => document.getElementById('import-area').textContent;

async function xlsxWithSheet(sheetName) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(sheetName).addRow(['이름']);
    return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('표에 늘어놓기', () => {
    it('여러 파일·zip 을 한 줄씩 늘어놓고, 파일마다 양식을 맞추고 회차 이름을 제안한다', async () => {
        const zip = zipSync({'2026-04 학평.xlsx': await xlsxOf(SCHEMAS.kimyoungil)});
        await addUploads([fakeFile('2026-03 학평.xlsx', await xlsxOf(SCHEMAS.univcoop)), fakeFile('묶음.zip', zip)]);
        expect(IMPORT.rows.map(r => [r.name, r.status, r.formatId, r.key])).toEqual([
            ['2026-03 학평.xlsx', 'ready', 'univcoop', '2026-03'],
            ['2026-04 학평.xlsx', 'ready', 'kimyoungil', '2026-04'],
        ]);
        expect(document.querySelectorAll('#import-area tbody tr[data-import]')).toHaveLength(2);
        expect(tableText()).toContain('묶음.zip 안');
        expect(document.getElementById('import-commit').textContent).toBe('2개 회차 불러오기');
    });

    it('「불러오기」 한 번으로 모두 회차로 넣는다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop)), fakeFile('4월.xlsx', await xlsxOf(SCHEMAS.kkumkugo))]);
        document.getElementById('import-commit').click();
        expect(ST.exams.map(e => [e.key, e.formatId, e.students.length])).toEqual([['3', 'univcoop', 13], ['4', 'kkumkugo', 13]]);
        expect(IMPORT.rows).toEqual([]);
        // 가상 학생 중 한 명은 탐구 과목이 같아 경고가 붙는다
        expect(document.getElementById('toast-msg').innerText).toMatch(/^2개 회차를 불러왔습니다. 「3」 탐구 과목 중복 1명/);
        expect(document.getElementById('tab-report').classList.contains('hidden')).toBe(false);
    });

    it('같은 파일을 또 올리면 표에 다시 넣지 않는다', async () => {
        const bytes = await xlsxOf(SCHEMAS.univcoop);
        await addUploads([fakeFile('3월.xlsx', bytes)]);
        await addUploads([fakeFile('3월 사본.xlsx', bytes)]);
        expect(IMPORT.rows).toHaveLength(1);
    });

    it('이미 불러온 파일이면 표에 알린다', async () => {
        const bytes = await xlsxOf(SCHEMAS.univcoop);
        await addUploads([fakeFile('3월.xlsx', bytes)]);
        commitImports();
        await addUploads([fakeFile('3월.xlsx', bytes)]);
        expect(tableText()).toContain('이미 불러온 파일');
    });

    it('엑셀이 아닌 파일은 건너뛰고 까닭을 적는다', async () => {
        await addUploads([fakeFile('성적.xlsm', new Uint8Array(8)), fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        expect(IMPORT.rows).toHaveLength(1);
        expect(tableText()).toContain('건너뛴 파일 1개: 성적.xlsm(엑셀 파일이 아닙니다.)');
    });

    // 최신 Chrome 의 File 에는 bytes() 메서드가 있다. zip 항목의 바이트로 잘못 보면
    // "Cannot read properties of undefined (reading 'slice')" 로 실패했다
    it('File 의 bytes() 메서드를 바이트로 잘못 보지 않는다', async () => {
        const bytes = await xlsxOf(SCHEMAS.univcoop);
        await addUploads([{...fakeFile('3월.xlsx', bytes), bytes: async () => bytes}]);
        expect(row().status).toBe('ready');
    });

    // 시트 이름을 이스케이프 없이 <option value="..."> 에 넣으면 " 에서 값이 잘려 시트를 못 찾았다
    it('따옴표가 든 시트 이름도 그대로 고를 수 있다', async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('1"반 & 2반').addRow(['이름']);
        wb.addWorksheet('두번째').addRow(['이름']);
        await addUploads([fakeFile('성적.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()))]);
        const sel = document.querySelector('[aria-label="성적.xlsx 시트"]');
        expect([...sel.options].map(o => o.value)).toEqual(['1"반 & 2반', '두번째']);
        expect(row().wb.getWorksheet(sel.value)).toBeTruthy();
    });
});

describe('감사 반영', () => {
    it('한 묶음 안의 같은 파일(엑셀과 그것을 담은 zip)도 한 번만 올린다', async () => {
        const bytes = await xlsxOf(SCHEMAS.univcoop);
        await addUploads([fakeFile('a.xlsx', bytes), fakeFile('a.zip', zipSync({'a.xlsx': bytes}))]);
        expect(IMPORT.rows).toHaveLength(1);
    });

    it('건너뛴 파일 안내는 묶음마다 이어 붙는다', async () => {
        await addUploads([fakeFile('a.txt', new Uint8Array(4))]);
        await addUploads([fakeFile('b.txt', new Uint8Array(4))]);
        expect(IMPORT.skipped.map(x => x.name)).toEqual(['a.txt', 'b.txt']);
    });

    it('양식을 잘못 고르면 불러오기 전에 그 줄에 범위 밖 점수를 알린다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        const sel = document.querySelector('[aria-label="3월.xlsx 양식"]');
        sel.value = 'kkumkugo';
        sel.dispatchEvent(new Event('change'));
        expect(tableText()).toMatch(/범위 밖 점수 \d+개/);
    });

    it('칸을 바꿔 표를 다시 그려도 포커스가 그 칸에 남는다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        const sel = document.querySelector('[aria-label="3월.xlsx 양식"]');
        sel.focus();
        sel.value = 'kkumkugo';
        sel.dispatchEvent(new Event('change'));
        expect(document.activeElement.getAttribute('aria-label')).toBe('3월.xlsx 양식');
        expect(document.activeElement).not.toBe(sel); // 새로 그린 칸이다
    });

    it('여는 중인 줄은 다시 해제하지 않는다', async () => {
        const r = {status: 'locked', busy: true, name: 'x.xlsx'};
        expect(await unlock(r, 'pw')).toBe(false);
    });
});

describe('양식', () => {
    it('머리글이 맞지 않으면 고르지 않고, 고를 때까지 불러오기를 막는다. 사람이 고를 수 있다', async () => {
        const headers = SCHEMAS.univcoop.exportHeaders.map(r => [...r]);
        headers[1][5] = '변경';
        await addUploads([fakeFile('3월.xlsx', new Uint8Array(await buildWorkbook({...SCHEMAS.univcoop, exportHeaders: headers}).xlsx.writeBuffer()))]);
        expect(row().formatId).toBeNull();
        expect(tableText()).toContain('양식 미확인');
        expect(document.getElementById('import-commit').disabled).toBe(true);
        expect(document.getElementById('import-note').textContent).toBe('3월.xlsx: 양식을 고르세요.');
        const sel = document.querySelector('[aria-label="3월.xlsx 양식"]');
        sel.value = 'univcoop';
        sel.dispatchEvent(new Event('change'));
        expect(row().formatId).toBe('univcoop');
        expect(document.getElementById('import-commit').disabled).toBe(false);
    });

    it('자동으로 고른 양식도 바꿀 수 있고, 미리보기는 앞 5줄과 읽는 열 이름을 보인다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        document.querySelector('[aria-label="3월.xlsx 미리보기"]').click();
        const preview = document.querySelector('#import-area tbody tr:not([data-import]) table');
        expect(preview.querySelectorAll(':scope > tbody > tr')).toHaveLength(SCHEMAS.univcoop.headerRows + 5);
        expect(preview.querySelector('thead').textContent).toContain('국어 원점수');
        const sel = document.querySelector('[aria-label="3월.xlsx 양식"]');
        sel.value = 'kkumkugo';
        sel.dispatchEvent(new Event('change'));
        expect(row().formatId).toBe('kkumkugo');
    });
});

describe('회차 이름', () => {
    it('비었거나 겹치면 불러오기를 막는다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop)), fakeFile('3월 재시험.xlsx', await xlsxOf(SCHEMAS.kkumkugo))]);
        expect(blockers(IMPORT.rows, ST.exams)).toEqual(['회차 이름 「3」이 겹칩니다.']);
        const input = document.querySelector('[aria-label="3월 재시험.xlsx 회차 이름"]');
        input.value = '';
        input.dispatchEvent(new Event('change'));
        expect(document.getElementById('import-note').textContent).toBe('3월 재시험.xlsx: 회차 이름을 넣어 주세요.');
        const again = document.querySelector('[aria-label="3월 재시험.xlsx 회차 이름"]');
        again.value = '3-2';
        again.dispatchEvent(new Event('change'));
        expect(document.getElementById('import-commit').disabled).toBe(false);
    });

    it('이미 있는 회차 이름도 막는다', async () => {
        loadSampleData();
        await addUploads([fakeFile('샘플.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        row().key = '샘플';
        renderImports();
        expect(document.getElementById('import-note').textContent).toBe('회차 이름 「샘플」이 겹칩니다.');
    }, 20000);
});

describe('암호 파일', () => {
    const PASSWORD = '비밀1234';
    const encrypted = async (schema, password = PASSWORD) =>
        new Uint8Array(toContainer(encryptAgile(Buffer.from(await xlsxOf(schema)), {password})));

    it('열지 않고 「암호 필요」로 두고, 그 줄에서 비밀번호를 넣어 연다', async () => {
        await addUploads([fakeFile('3월.xlsx', await encrypted(SCHEMAS.univcoop))]);
        expect(row().status).toBe('locked');
        expect(tableText()).toContain('암호 필요');
        expect(document.getElementById('import-note').textContent).toBe('3월.xlsx: 비밀번호를 넣어 주세요.');
        document.querySelector('[aria-label="3월.xlsx 비밀번호"]').value = PASSWORD;
        document.querySelector('[aria-label="3월.xlsx 열기"]').click();
        await vi.waitFor(() => expect(row().status).toBe('ready'));
        expect(row().formatId).toBe('univcoop');
    });

    it('비밀번호가 틀리면 그 줄에 알린다', async () => {
        await addUploads([fakeFile('3월.xlsx', await encrypted(SCHEMAS.univcoop))]);
        expect(await unlock(row(), '틀림')).toBe(false);
        renderImports();
        expect(tableText()).toContain('비밀번호가 맞지 않습니다.');
    });

    it('여러 파일에 같은 비밀번호를 한 번에 넣는다. 다른 비밀번호 파일은 잠긴 채 남는다', async () => {
        await addUploads([
            fakeFile('3월.xlsx', await encrypted(SCHEMAS.univcoop)),
            fakeFile('4월.xlsx', await encrypted(SCHEMAS.kkumkugo)),
            fakeFile('5월.xlsx', await encrypted(SCHEMAS.kimyoungil, '다른암호')),
        ]);
        expect(tableText()).toContain('암호가 걸린 파일 3개');
        document.querySelector('[aria-label="모든 암호 파일 비밀번호"]').value = PASSWORD;
        [...document.querySelectorAll('#import-area button')].find(b => b.textContent === '모두 열기').click();
        await vi.waitFor(() => expect(IMPORT.rows.map(r => r.status)).toEqual(['ready', 'ready', 'locked']));
    });

    // 예전에는 "파일이 손상되었을 수 있습니다" 로 끝나 무엇을 해야 할지 알 수 없었다
    it('암호가 걸린 옛 .xls 는 그 줄에 암호를 풀거나 .xlsx 로 저장하라고 알린다(이름만 .xlsx 여도)', async () => {
        for (const name of ['성적.xls', '성적2.xlsx']) {
            clearAll();
            await addUploads([fakeFile(name, encryptedXls())]);
            expect(row().status).toBe('error');
            expect(row().include).toBe(false);
            expect(tableText()).toContain('암호가 걸린 옛 형식(.xls)은 열 수 없습니다.');
        }
    });

    it('확장자만 .xlsx 인 평범한 .xls 는 비밀번호 없이 읽는다', async () => {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['이름'], ['학생1']]), '성적');
        await addUploads([fakeFile('성적.xlsx', new Uint8Array(XLSX.write(book, {type: 'array', bookType: 'biff8'})))]);
        expect(row().status).toBe('ready');
        expect(row().wb.getWorksheet('성적').getCell('A2').value).toBe('학생1');
    });

    it('다른 읽기 오류는 손상 안내다', async () => {
        await addUploads([fakeFile('성적.xls', new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 1, 2, 3]))]);
        expect(tableText()).toContain('파일을 읽지 못했습니다.');
    });
});

// 암호가 걸린 옛 .xls: SheetJS 가 쓴 BIFF8 의 Workbook 스트림 첫 BOF 뒤에 FILEPASS(0x002F,
// RC4) 레코드를 끼워 넣는다. SheetJS 는 password 옵션이 없으면 "File is password-protected" 를 던진다
function encryptedXls() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['이름'], ['학생1']]), '성적');
    const cfb = XLSX.CFB.read(new Uint8Array(XLSX.write(book, {type: 'array', bookType: 'biff8'})), {type: 'array'});
    const entry = XLSX.CFB.find(cfb, '/Workbook');
    const wbStream = Uint8Array.from(entry.content);
    const bofEnd = 4 + (wbStream[2] | (wbStream[3] << 8));
    const body = [0x01, 0x00, 0x01, 0x00, 0x01, 0x00, ...Array(48).fill(0x11)];
    const filePass = [0x2F, 0x00, body.length, 0x00, ...body];
    entry.content = Uint8Array.from([...wbStream.subarray(0, bofEnd), ...filePass, ...wbStream.subarray(bofEnd)]);
    entry.size = entry.content.length;
    return new Uint8Array(XLSX.CFB.write(cfb, {type: 'array'}));
}

describe('목록 다루기', () => {
    it('「빼기」는 그 줄을, 「목록 비우기」는 표를 비운다. 회차는 건드리지 않는다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop)), fakeFile('4월.xlsx', await xlsxOf(SCHEMAS.kkumkugo))]);
        document.querySelector('[aria-label="3월.xlsx 목록에서 빼기"]').click();
        expect(IMPORT.rows.map(r => r.name)).toEqual(['4월.xlsx']);
        [...document.querySelectorAll('#import-area button')].find(b => b.textContent === '목록 비우기').click();
        expect(IMPORT.rows).toEqual([]);
        expect(document.getElementById('import-area').textContent).toBe('');
    });

    it('체크를 끈 파일은 불러오지 않고 표에 남는다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop)), fakeFile('4월.xlsx', await xlsxOf(SCHEMAS.kkumkugo))]);
        const box = document.querySelector('[aria-label="4월.xlsx 불러오기"]');
        box.checked = false;
        box.dispatchEvent(new Event('change'));
        document.getElementById('import-commit').click();
        expect(ST.exams.map(e => e.key)).toEqual(['3']);
        expect(IMPORT.rows.map(r => r.name)).toEqual(['4월.xlsx']);
    });

    it('불러온 회차의 경고(탐구 과목 중복·범위 이탈)를 알림으로 모은다', async () => {
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        row().formatId = 'kkumkugo'; // 일부러 맞지 않는 양식
        renderImports();
        document.getElementById('import-commit').click();
        expect(document.getElementById('toast-msg').innerText).toMatch(/^1개 회차를 불러왔습니다\. 「3」 .*범위를 벗어난 점수/);
        expect(document.getElementById('toast-icon').className).toContain('text-red-400');
    });

    it('prepareUploads 는 화면 없이도 쓴다', async () => {
        const {rows, skipped} = await prepareUploads([fakeFile('3월.xlsx', await xlsxWithSheet('S'))]);
        expect(rows).toHaveLength(1);
        expect(skipped).toEqual([]);
    });
});

describe('clearAll (전체 지우기)', () => {
    // 데이터를 비웠는데 이전 리포트가 화면에 남아 있으면 그 위의 선택 상자나 학생 행이
    // 비어 있는 ST.data 를 건드려 오류가 났다
    it('데이터를 비우면 리포트와 내보내기도 빈 상태로 돌아간다', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        loadSampleData();
        await addUploads([fakeFile('3월.xlsx', await xlsxOf(SCHEMAS.univcoop))]);
        vi.restoreAllMocks();
        expect(ST.data).toHaveLength(100);
        expect(document.getElementById('export-cards').innerHTML).not.toBe('');

        clearAll();

        expect(ST.data).toBeNull();
        expect(ST.exams).toEqual([]);
        expect(IMPORT.rows).toEqual([]);
        expect(ST.cache).toBeNull();
        expect(document.getElementById('report-content').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('export-cards').innerHTML).toBe('');
        expect(document.getElementById('export-empty').classList.contains('hidden')).toBe(false);
    }, 20000);

    it('데이터가 비어 있을 때 리포트 핸들러가 오류를 내지 않는다', () => {
        clearAll();
        expect(() => renderSubjectsCharts()).not.toThrow();
        expect(() => showStudentDetail('홍길동', '1', '1')).not.toThrow();
    });
});
