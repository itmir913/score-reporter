import {describe, expect, it, vi} from 'vitest';
import ExcelJS from 'exceljs';
import {GradeExporter} from '../src/js/exporter.js';
import {GradeDataParser} from '../src/js/parser.js';
import {ensureNumericOrZero, FormatSchema, SCHEMAS} from '../src/js/schema.js';

/* 내보내기는 마지막에 dlBlob으로 파일을 내려받게 한다. 그 Blob을 가로채
 * 다시 읽어 오면, 만들어진 엑셀의 실제 내용을 확인할 수 있다. */
async function exportAndRead(students, target) {
    let captured = null;
    vi.stubGlobal('URL', {
        createObjectURL: (blob) => {
            captured = blob;
            return 'blob:test';
        },
        revokeObjectURL: () => {
        },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    });

    await GradeExporter.toXlsx(students, target, '성적.xlsx');

    click.mockRestore();
    vi.unstubAllGlobals();

    // jsdom의 Blob에는 arrayBuffer()가 없어 FileReader로 읽는다
    const buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(captured);
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('성적데이터');
    // 1-based인 ExcelJS 좌표를 0-based 배열로 바꿔 다루기 쉽게 만든다
    const rows = [];
    ws.eachRow({includeEmpty: true}, (row) => {
        const cells = [];
        row.eachCell({includeEmpty: true}, (cell, i) => {
            cells[i - 1] = cell.value ?? '';
        });
        rows.push(cells);
    });
    return rows;
}

/** 파서가 만들어 내는 모양의 학생 레코드. */
function student({name, cls = '1', number = '1', korRaw = null, korGrade = null, engGrade = null}) {
    const blank = {subject: '', common_raw: null, select_raw: null, raw: null, std: null, pct: null, grade: null};
    return {
        exam_year: '2026', grade_year: '3', class: cls, number, name,
        korean: {...blank, subject: '언어와 매체', raw: korRaw, grade: korGrade},
        math: {...blank}, english: {...blank, grade: engGrade},
        inquiry1: {...blank}, inquiry2: {...blank}, hist: {...blank}, fl2: {...blank},
    };
}

const target = new FormatSchema({
    id: 'out', label: '내보내기 양식', color: 'blue', icon: 'fa-table',
    headerRows: 1,
    exportHeaders: [['학년', '반', '번호', '이름', '국어선택', '국어원점수', '국어등급', '영어등급']],
    fields: {
        grade_year: 'A', class: 'B', number: 'C', name: 'D',
        kor_subject: 'E', kor_raw: 'F', kor_grade: 'G', eng_grade: 'H',
    },
});

describe('GradeExporter.toXlsx', () => {
    it('머리글을 먼저 쓰고 그 아래에 학생을 쓴다', async () => {
        const rows = await exportAndRead([student({name: '홍길동'})], target);
        expect(rows[0]).toEqual(['학년', '반', '번호', '이름', '국어선택', '국어원점수', '국어등급', '영어등급']);
        expect(rows).toHaveLength(2);
        expect(rows[1][3]).toBe('홍길동');
    });

    it('값을 양식이 정한 열에 넣는다', async () => {
        const rows = await exportAndRead(
            [student({name: '김철수', cls: '2', number: '7', korRaw: 88, korGrade: 2, engGrade: 1})], target);
        const [, r] = rows;
        expect(r[0]).toBe('3');            // A 학년
        expect(r[1]).toBe('2');            // B 반
        expect(r[2]).toBe('7');            // C 번호
        expect(r[3]).toBe('김철수');        // D 이름
        expect(r[4]).toBe('언어와 매체');   // E 국어선택
        expect(r[5]).toBe(88);             // F 국어원점수
        expect(r[6]).toBe(2);              // G 국어등급
        expect(r[7]).toBe(1);              // H 영어등급
    });

    // 이 앱의 핵심 용도가 양식 변환이다. 응시하지 않은 과목이 0점으로 나가면
    // 옮겨 간 프로그램에서 그 학생은 0점을 받은 것으로 처리된다.
    it('점수가 없는 칸은 0이 아니라 빈 칸으로 나간다', async () => {
        const rows = await exportAndRead([student({name: '이영희', korRaw: null, korGrade: null})], target);
        const [, r] = rows;
        expect(r[5]).toBe('');
        expect(r[6]).toBe('');
        expect(r[5]).not.toBe(0);
        expect(r[6]).not.toBe(0);
    });

    it('0점은 0으로 남는다', async () => {
        const rows = await exportAndRead([student({name: '박영수', korRaw: 0, korGrade: 9})], target);
        expect(rows[1][5]).toBe(0);
        expect(rows[1][6]).toBe(9);
    });

    it('숫자 필드에는 변환기가 자동으로 걸려 있다', () => {
        expect(target.customGetters.kor_raw).toBe(ensureNumericOrZero);
        expect(target.customGetters.name).toBeUndefined();
    });

    it('학생마다 한 줄씩 쓴다', async () => {
        const three = ['가나다', '라마바', '사아자'].map(name => student({name}));
        const rows = await exportAndRead(three, target);
        expect(rows).toHaveLength(1 + 3);
        expect(rows.slice(1).map(r => r[3])).toEqual(['가나다', '라마바', '사아자']);
    });

    it('양식에 없는 항목은 내보내지 않는다', async () => {
        const rows = await exportAndRead([student({name: '홍길동'})], target);
        // 이 양식은 H(8번째)까지만 쓴다
        expect(rows[1].length).toBeLessThanOrEqual(8);
    });
});

describe('내보낸 파일을 다시 읽어도 성적이 그대로다', () => {
    // 실제 양식으로 내보내고, 같은 양식으로 다시 불러온다.
    // 열 배치와 머리글 줄 수가 서로 맞물려야만 통과한다.
    it.each(Object.values(SCHEMAS).map(s => [s.label, s]))('%s', async (_label, schema) => {
        const students = [
            student({name: '홍길동', cls: '1', number: '1', korRaw: 88, korGrade: 2, engGrade: 1}),
            student({name: '김철수', cls: '2', number: '15', korRaw: 0, korGrade: 9, engGrade: null}),
        ];
        const rows = await exportAndRead(students, schema);

        const wb = new ExcelJS.Workbook();
        wb.addWorksheet('성적').addRows(rows);
        const back = new GradeDataParser(schema).parse(wb, '성적');

        // 이름은 모든 양식이 갖는다. 파서가 이 칸으로 학생 행을 가려내기 때문이다.
        expect(back.map(s => s.name)).toEqual(['홍길동', '김철수']);

        // 나머지는 양식마다 있는 열이 다르므로, 그 양식이 지원할 때만 따진다.
        if (schema.supports('class')) expect(back.map(s => s.class)).toEqual(['1', '2']);
        if (schema.supports('number')) expect(back.map(s => s.number)).toEqual(['1', '15']);
        if (schema.supports('kor_grade')) expect(back.map(s => s.korean.grade)).toEqual([2, 9]);

        // 응시하지 않은 영어 등급은 왕복해도 null로 남아야 한다
        if (schema.supports('eng_grade')) expect(back[1].english.grade).toBeNull();
    });

    // 위 왕복 시험이 조건부로 넘어가는 항목들이 실제로 어떤 상태인지 못 박아 둔다.
    // 이게 없으면 열이 통째로 빠져도 시험이 조용히 통과한다.
    it('양식마다 지원 항목이 다르다', () => {
        const supports = (id, key) => SCHEMAS[id].supports(key);

        // 김영일 양식은 반과 번호 열이 없다 (열 문자가 비어 있다)
        expect(SCHEMAS.kimyoungil.fields.class).toBe('');
        expect(supports('kimyoungil', 'class')).toBe(false);
        expect(supports('kimyoungil', 'number')).toBe(false);

        // 가채점 양식에는 등급이 없다
        expect(supports('daegyohyeop_preview', 'kor_grade')).toBe(false);
        expect(supports('daegyohyeop', 'kor_grade')).toBe(true);

        // 이름은 모든 양식에 있어야 한다
        for (const s of Object.values(SCHEMAS)) expect(s.supports('name')).toBe(true);
    });
});
