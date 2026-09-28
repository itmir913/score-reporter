import {describe, expect, it} from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {GradeDataParser} from '../src/js/parser.js';
import {FormatSchema, SCHEMAS} from '../src/js/schema.js';
import {exceljsTo2DArray, sheetjsTo2DArray} from '../src/js/main.js';

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

describe('exceljsTo2DArray 셀 값 풀기 (.xlsx)', () => {
    const schema = new FormatSchema({
        id: 't', label: 't', color: 'blue', icon: 'fa-table', headerRows: 1,
        fields: {name: 'A', kor_raw: 'B', kor_subject: 'C'},
    });

    // 실제 xlsx 로 저장했다가 다시 읽어, 파일에서 오는 모양 그대로 확인한다
    async function roundTrip(fill) {
        const wb0 = new ExcelJS.Workbook();
        const ws0 = wb0.addWorksheet('S');
        ws0.addRow(['이름', '국어', '선택']);
        fill(ws0);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await wb0.xlsx.writeBuffer());
        return wb;
    }

    it('이름이 하이퍼링크로 걸린 학생도 읽는다', async () => {
        const wb = await roundTrip(ws => {
            ws.getCell('A2').value = {text: '홍길동', hyperlink: 'https://example.com'};
            ws.getCell('B2').value = 80;
        });
        const students = new GradeDataParser(schema).parse(wb, 'S');
        expect(students.map(s => [s.name, s.korean.raw])).toEqual([['홍길동', 80]]);
    });

    it('하이퍼링크 글자가 서식 있는 텍스트여도 이어 붙인다', () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('S');
        ws.getCell('A1').value = {text: {richText: [{text: '김'}, {text: '철수'}]}, hyperlink: 'x'};
        expect(exceljsTo2DArray(ws)[0][0]).toBe('김철수');
    });

    // =VLOOKUP 이 #N/A 를 낸 이름 칸이 "[object Object]" 라는 학생이 되면 안 된다
    it('수식 결과가 에러면 빈칸으로 본다', async () => {
        const wb = await roundTrip(ws => {
            ws.getCell('A2').value = {formula: 'VLOOKUP(1,Z1:Z2,1,0)', result: {error: '#N/A'}};
            ws.getCell('B2').value = 70;
            ws.getCell('A3').value = '김철수';
            ws.getCell('B3').value = {formula: '1/0', result: {error: '#DIV/0!'}};
        });
        const students = new GradeDataParser(schema).parse(wb, 'S');
        expect(students.map(s => [s.name, s.korean.raw])).toEqual([['김철수', null]]);
    });

    it('수식 결과가 숫자나 날짜면 그 값을 쓴다', () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('S');
        ws.getCell('A1').value = {formula: 'B1', result: 0};
        ws.getCell('B1').value = {sharedFormula: 'A1', result: 77};
        ws.getCell('C1').value = {formula: 'TODAY()', result: new Date(Date.UTC(2026, 0, 2))};
        ws.getCell('D1').value = {formula: 'X1'}; // 계산된 값이 저장되지 않은 수식
        expect(exceljsTo2DArray(ws)[0]).toEqual([0, 77, '2026-01-02', '']);
    });
});

// ExcelJS 의 cell.value 는 결과가 0 인 수식에서 result 를 빼 버린다.
// 수식으로 낸 0점이 빈칸(미응시)으로 읽혀 통계에서 빠지면 안 된다.
it('수식 결과가 0이면 0점으로 읽는다', async () => {
    const wb0 = new ExcelJS.Workbook();
    const ws0 = wb0.addWorksheet('S');
    ws0.getCell('A1').value = 3;
    ws0.getCell('B1').value = {formula: 'A1-3', result: 5};
    ws0.getCell('B1').model.result = 0; // value 로는 0 을 넣을 수 없어 모델에 직접 넣는다
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await wb0.xlsx.writeBuffer());
    expect(exceljsTo2DArray(wb.getWorksheet('S'))[0]).toEqual([3, 0]);
});
