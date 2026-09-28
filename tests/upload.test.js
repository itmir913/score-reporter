import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {clearFile, loadSampleData, processFile, ST} from '../src/js/main.js';
import {showStudentDetail} from '../src/js/report/report-modal.js';
import {renderSubjectsCharts} from '../src/js/report/report-render-chart-subjects.js';

/* 파일을 올렸을 때 화면과 상태가 어떻게 바뀌는지 실제 마크업 위에서 본다. */

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
});

// jsdom 의 File 에는 arrayBuffer() 가 없어서 processFile 이 쓰는 부분만 흉내 낸다
function fakeFile(name, buffer) {
    return {name, size: buffer.byteLength, arrayBuffer: async () => buffer};
}

async function xlsxWithSheet(sheetName) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(sheetName).addRow(['이름']);
    return wb.xlsx.writeBuffer();
}

describe('processFile', () => {
    // 시트 이름을 이스케이프 없이 <option value="..."> 에 넣으면 " 에서 값이 잘려
    // 시트를 찾지 못하고, 미리보기와 파싱이 빈 결과가 되었다.
    it('따옴표가 든 시트 이름도 그대로 고를 수 있다', async () => {
        await processFile(fakeFile('성적.xlsx', await xlsxWithSheet('1"반 & 2반')));
        const sel = document.getElementById('sheet-select');
        expect(sel.value).toBe('1"반 & 2반');
        expect(ST.wb.getWorksheet(sel.value)).toBeTruthy();
    });

    // 확장자만 .xlsx 인 옛 .xls 는 OLE2 컨테이너라 예전에는 비밀번호를 물은 뒤
    // "암호화된 Office 파일이 아닙니다" 로 실패했다. 묻지 않고 .xls 처럼 읽어야 한다.
    it('확장자만 .xlsx 인 평범한 .xls 는 비밀번호를 묻지 않고 읽는다', async () => {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['이름'], ['학생1']]), '성적');
        const xls = new Uint8Array(XLSX.write(book, {type: 'array', bookType: 'biff8'}));
        const ask = vi.spyOn(window, 'prompt').mockImplementation(() => null);

        await processFile(fakeFile('성적.xlsx', xls.buffer));

        expect(ask).not.toHaveBeenCalled();
        ask.mockRestore();
        expect(ST.wb.worksheets.map(ws => ws.name)).toEqual(['성적']);
        expect(ST.wb.getWorksheet('성적').getCell('A2').value).toBe('학생1');
    });
});

describe('지원하지 않는 파일 형식', () => {
    // 끌어다 놓기는 accept 를 거치지 않는다. .xlsm 같은 파일이 시트 0개로
    // "데이터를 성공적으로 불러왔습니다." 를 띄웠다.
    it('.xlsm 은 오류를 알리고 파일 올리기 화면에 머문다', async () => {
        await processFile(fakeFile('성적.xlsm', new ArrayBuffer(8)));
        expect(document.getElementById('toast-msg').innerText).toBe('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv)');
        expect(ST.wb).toBeNull();
        expect(document.getElementById('dropzone').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('file-info').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('format-area').classList.contains('hidden')).toBe(true);
    });
});

describe('processFile 을 겹쳐 부를 때', () => {
    // 앞 파일을 읽는(암호를 푸는) 동안 다른 파일을 올리면, 늦게 끝난 앞 파일이
    // 화면과 ST.wb 를 덮어써 고른 양식·미리보기는 뒤 파일 것인데 앞 파일을 파싱했다.
    it('나중에 올린 파일이 이긴다', async () => {
        let releaseA;
        const gate = new Promise(r => {
            releaseA = r;
        });
        const csv = (text) => new TextEncoder().encode(text).buffer;
        const slowA = {
            name: 'A.csv', size: 10, arrayBuffer: async () => {
                await gate;
                return csv('이름\n가\n');
            }
        };
        const pA = processFile(slowA);
        await new Promise(r => setTimeout(r, 60));
        await processFile(fakeFile('B.csv', csv('이름\n나\n')));
        const wbB = ST.wb;
        releaseA();
        await pA;
        expect(ST.file.name).toBe('B.csv');
        expect(ST.wb).toBe(wbB);
        expect(document.getElementById('file-name').innerText).toBe('B.csv');
    });
});

describe('clearFile', () => {
    // 새 파일을 올리면 clearFile 이 ST.data 를 비운다. 이전 리포트가 화면에 남아
    // 있으면 그 위의 선택 상자나 학생 행이 비어 있는 ST.data 를 건드려 오류가 났다.
    it('데이터를 비우면 리포트와 내보내기도 빈 상태로 돌아간다', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
        try {
            loadSampleData();
        } catch {
            // jsdom 에서는 차트를 못 그린다. 데이터와 화면 전환만 있으면 된다
        }
        vi.restoreAllMocks();
        expect(ST.data).toHaveLength(100);
        expect(document.getElementById('report-content').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('export-cards').innerHTML).not.toBe('');

        clearFile();

        expect(ST.data).toBeNull();
        expect(ST.cache).toBeNull();
        expect(document.getElementById('report-content').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('report-empty').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('export-cards').innerHTML).toBe('');
        expect(document.getElementById('export-summary').textContent).toContain('불러온 데이터가 없습니다');
    });

    it('데이터가 비어 있을 때 리포트 핸들러가 오류를 내지 않는다', () => {
        clearFile();
        expect(() => renderSubjectsCharts()).not.toThrow();
        expect(() => showStudentDetail('홍길동', '1', '1')).not.toThrow();
    });
});
