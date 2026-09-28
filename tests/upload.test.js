import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import ExcelJS from 'exceljs';
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
