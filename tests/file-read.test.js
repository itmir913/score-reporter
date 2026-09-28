import {describe, expect, it} from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {GradeDataParser} from '../src/js/parser.js';
import {SCHEMAS} from '../src/js/schema.js';
import {sheetjsTo2DArray} from '../src/js/main.js';

/* 업로드한 파일을 파서가 읽는 2차원 배열로 바꾸는 단계를 본다.
 * 여기서 행이나 열이 한 칸만 밀려도 학생이 빠지거나 옆 과목 점수를 읽는다. */

// .xls 를 실제로 쓰고 다시 읽는다. !ref 는 파일에 적힌 사용 범위를 그대로 따른다.
function xlsRoundTrip(cells, ref) {
    const sheet = {'!ref': ref};
    for (const [addr, v] of Object.entries(cells)) {
        sheet[addr] = {t: typeof v === 'number' ? 'n' : 's', v};
    }
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'S');
    const back = XLSX.read(XLSX.write(book, {type: 'array', bookType: 'biff8'}), {type: 'array'});
    return back.Sheets.S;
}

// main.js 의 .xls/.csv 경로와 같은 순서로 ExcelJS 워크북에 옮겨 파싱한다
function parseSheet(sheet, schema) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('S').addRows(sheetjsTo2DArray(sheet));
    return new GradeDataParser(schema).parse(wb, 'S');
}

describe('sheetjsTo2DArray (.xls/.csv)', () => {
    // 가채점 양식은 1행이 비어 있다. !ref 가 A2 에서 시작해도 머리글 3행을
    // 건너뛴 뒤 첫 학생부터 읽어야 한다.
    it('1행이 비어 있어도 첫 학생을 잃지 않는다', () => {
        const sheet = xlsRoundTrip({
            A2: '학년도', B2: '학년', C2: '반', D2: '번호', E2: '이름', F2: '한국사',
            F3: '원점수',
            A4: 2027, B4: 3, C4: 1, D4: 1, E4: '학생A', F4: 40,
            A5: 2027, B5: 3, C5: 1, D5: 2, E5: '학생B', F5: 45,
        }, 'A2:F5');
        expect(sheet['!ref']).toBe('A2:F5');

        const students = parseSheet(sheet, SCHEMAS.daegyohyeop_preview);
        expect(students.map(s => s.name)).toEqual(['학생A', '학생B']);
    });

    // A열(학년도)이 통째로 비어 있으면 !ref 가 B 에서 시작한다. 열 문자는
    // 그대로 A 기준이어야 한다.
    it('A열이 비어 있어도 열이 당겨지지 않는다', () => {
        const sheet = xlsRoundTrip({
            B1: '학년', C1: '반', D1: '번호', E1: '이름', F1: '한국사',
            F2: '원점수',
            B3: 3, C3: 1, D3: 1, E3: '학생A', F3: 40,
        }, 'B1:F3');
        expect(sheet['!ref']).toBe('B1:F3');

        const [s] = parseSheet(sheet, SCHEMAS.daegyohyeop);
        expect(s.grade_year).toBe('3');
        expect(s.class).toBe('1');
        expect(s.number).toBe('1');
        expect(s.name).toBe('학생A');
        expect(s.hist.raw).toBe(40);
    });

    it('빈 시트는 빈 배열이다', () => {
        expect(sheetjsTo2DArray({})).toEqual([]);
    });
});
