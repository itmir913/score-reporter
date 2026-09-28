import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import ExcelJS from 'exceljs';
import {processFile, ST} from '../src/js/main.js';

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
});
