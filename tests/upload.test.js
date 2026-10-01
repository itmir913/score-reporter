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

// 암호가 걸린 옛 .xls: SheetJS 가 쓴 BIFF8 의 Workbook 스트림 첫 BOF 뒤에 FILEPASS(0x002F,
// RC4) 레코드를 끼워 넣는다. Excel 이 암호를 걸면 이 레코드가 생기고 뒤 레코드가 암호화된다.
// SheetJS 는 password 옵션이 없으면 레코드 내용을 보기 전에 "File is password-protected" 를 던진다
function encryptedXls() {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['이름'], ['학생1']]), '성적');
    const cfb = XLSX.CFB.read(new Uint8Array(XLSX.write(book, {type: 'array', bookType: 'biff8'})), {type: 'array'});
    const entry = XLSX.CFB.find(cfb, '/Workbook');
    const wbStream = Uint8Array.from(entry.content);
    const bofEnd = 4 + (wbStream[2] | (wbStream[3] << 8));
    const body = [0x01, 0x00, 0x01, 0x00, 0x01, 0x00, ...Array(48).fill(0x11)]; // 형식 RC4, 버전 1.1, salt·검증값
    const filePass = [0x2F, 0x00, body.length, 0x00, ...body];
    entry.content = Uint8Array.from([...wbStream.subarray(0, bofEnd), ...filePass, ...wbStream.subarray(bofEnd)]);
    entry.size = entry.content.length;
    return new Uint8Array(XLSX.CFB.write(cfb, {type: 'array'}));
}

describe('암호가 걸린 옛 .xls', () => {
    const MSG = '암호가 걸린 옛 형식(.xls) 파일은 지원하지 않습니다. 엑셀에서 암호를 풀거나 .xlsx 로 저장해 주세요.';

    it('SheetJS 는 암호 파일이라고 알린다 (재료 확인)', () => {
        expect(() => XLSX.read(encryptedXls(), {type: 'array'})).toThrow(/password-protected/);
    });

    // 예전에는 "파일이 손상되었을 수 있습니다" 로 끝나 무엇을 해야 할지 알 수 없었다
    it('.xls 는 암호를 풀거나 .xlsx 로 저장하라고 알린다', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
        await processFile(fakeFile('성적.xls', encryptedXls().buffer));
        vi.restoreAllMocks();
        expect(document.getElementById('toast-msg').innerText).toBe(MSG);
        expect(ST.wb).toBeNull();
    });

    it('확장자만 .xlsx 여도 비밀번호를 묻지 않고 같은 안내를 한다', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
        const ask = vi.spyOn(window, 'prompt').mockImplementation(() => null);
        await processFile(fakeFile('성적.xlsx', encryptedXls().buffer));
        const asked = ask.mock.calls.length; // restoreAllMocks 가 호출 기록도 지운다
        vi.restoreAllMocks();
        expect(asked).toBe(0);
        expect(document.getElementById('toast-msg').innerText).toBe(MSG);
    });

    it('다른 읽기 오류는 예전처럼 손상 안내다', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
        await processFile(fakeFile('성적.xls', new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 1, 2, 3]).buffer));
        vi.restoreAllMocks();
        expect(document.getElementById('toast-msg').innerText).toBe('파일을 읽는 데 실패했습니다. 파일이 손상되었을 수 있습니다.');
    });
});

describe('암호가 걸린 .xlsx 컨테이너', () => {
    // 암호 확인(두 번)과 해제가 각자 CFB 를 다시 읽어, 큰 파일을 세 번 읽었다
    it('업로드 한 번에 한 번만 읽는다', async () => {
        const cfb = XLSX.CFB.utils.cfb_new();
        // 지원하지 않는 버전(4.3)이라 해제 단계에서 멈춘다. 컨테이너를 읽은 횟수만 본다
        XLSX.CFB.utils.cfb_add(cfb, '/EncryptionInfo', new Uint8Array([0x04, 0x00, 0x03, 0x00, 0, 0, 0, 0]));
        XLSX.CFB.utils.cfb_add(cfb, '/EncryptedPackage', new Uint8Array(16));
        const bytes = new Uint8Array(XLSX.CFB.write(cfb, {type: 'array'}));
        vi.spyOn(console, 'error').mockImplementation(() => {
        });
        const ask = vi.spyOn(window, 'prompt').mockImplementation(() => 'pw');
        const read = vi.spyOn(XLSX.CFB, 'read');
        await processFile(fakeFile('성적.xlsx', bytes.buffer));
        const calls = read.mock.calls.length;
        const asked = ask.mock.calls.length;
        vi.restoreAllMocks();
        expect(asked).toBe(1);
        expect(calls).toBe(1);
        expect(document.getElementById('toast-msg').innerText).toBe('파일을 읽는 데 실패했습니다. 파일이 손상되었을 수 있습니다.');
    });
});

describe('지원하지 않는 파일 형식', () => {
    // 끌어다 놓기는 accept 를 거치지 않는다. .xlsm 같은 파일이 시트 0개로
    // "데이터를 성공적으로 불러왔습니다." 를 띄웠다.
    it('.xlsm 은 오류를 알리고 파일 올리기 화면에 머문다', async () => {
        // 이제 잘못된 형식은 상태를 건드리지 않는다. 앞 테스트가 불러온 파일을 먼저 비운다
        clearFile();
        await processFile(fakeFile('성적.xlsm', new ArrayBuffer(8)));
        expect(document.getElementById('toast-msg').innerText).toBe('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv)');
        expect(ST.wb).toBeNull();
        expect(document.getElementById('dropzone').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('file-info').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('format-area').classList.contains('hidden')).toBe(true);
    });

    // 예전에는 확장자를 보기 전에 clearFile 로 비워, 잘못 끌어다 놓은 파일 하나에
    // 보던 데이터·리포트와 읽고 있던 파일까지 사라졌다
    it('지금 불러온 파일과 데이터는 그대로 둔다', async () => {
        await processFile(fakeFile('성적.xlsx', await xlsxWithSheet('S')));
        const wb = ST.wb;
        ST.data = [{name: '가'}];
        await processFile(fakeFile('성적.xlsm', new ArrayBuffer(8)));
        expect(document.getElementById('toast-msg').innerText).toBe('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv)');
        expect(ST.wb).toBe(wb);
        expect(ST.file.name).toBe('성적.xlsx');
        expect(ST.data).toEqual([{name: '가'}]);
        expect(document.getElementById('file-info').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('format-area').classList.contains('hidden')).toBe(false);
    });

    // 0.1.34 부터 clearFile 을 부르지 않아 파일 선택 칸 값이 남았다. 같은 파일을 다시
    // 고르면 change 가 일지 않아 아무 알림도 없었다. 선택 칸만 비우고 나머지는 그대로 둔다
    it('파일 선택 칸만 비워 같은 파일을 다시 고를 수 있게 한다', async () => {
        await processFile(fakeFile('성적.xlsx', await xlsxWithSheet('S')));
        const wb = ST.wb;
        ST.data = [{name: '가'}];
        // jsdom 의 파일 칸에는 글자 값을 넣을 수 없어, 값을 흉내 내는 속성을 씌운다
        const input = document.getElementById('fileInput');
        let value = 'C:\\fakepath\\성적.xlsm';
        Object.defineProperty(input, 'value', {configurable: true, get: () => value, set: v => {
            value = v;
        }});
        await processFile(fakeFile('성적.xlsm', new ArrayBuffer(8)));
        expect(input.value).toBe('');
        expect(document.getElementById('toast-msg').innerText).toBe('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv)');
        expect(ST.wb).toBe(wb);
        expect(ST.data).toEqual([{name: '가'}]);
        expect(document.getElementById('file-info').classList.contains('hidden')).toBe(false);
    });

    it('읽고 있던 파일을 끊지 않는다', async () => {
        let release;
        const gate = new Promise(r => {
            release = r;
        });
        const slow = {
            name: 'A.csv', size: 10, arrayBuffer: async () => {
                await gate;
                return new TextEncoder().encode('이름\n가\n').buffer;
            }
        };
        const p = processFile(slow);
        await new Promise(r => setTimeout(r, 60));
        await processFile(fakeFile('성적.xlsm', new ArrayBuffer(8)));
        release();
        await p;
        expect(ST.file?.name).toBe('A.csv');
        expect(document.getElementById('toast-msg').innerText).toBe('데이터를 성공적으로 불러왔습니다.');
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
    }, 20000); // 샘플 100명으로 리포트 전체를 그려 기본 5초를 넘길 때가 있다

    it('데이터가 비어 있을 때 리포트 핸들러가 오류를 내지 않는다', () => {
        clearFile();
        expect(() => renderSubjectsCharts()).not.toThrow();
        expect(() => showStudentDetail('홍길동', '1', '1')).not.toThrow();
    });
});
