import {beforeAll, describe, expect, it} from 'vitest';
import ExcelJS from 'exceljs';
import {GradeDataParser} from '../src/js/parser.js';
import {FormatSchema} from '../src/js/schema.js';

/* 진짜 ExcelJS 워크북을 만들어 넘긴다. 파서는 시트를 2차원 배열로 바꾸는
 * exceljsTo2DArray를 거치므로, 가짜 객체를 흉내 내면 그 변환이 검증에서 빠진다. */

// kor_raw 를 일부러 넣지 않았다. 원점수 열이 없는 양식에서 공통+선택을 더해
// 채우는 동작을 보기 위해서다.
const schema = new FormatSchema({
    id: 'test', label: '테스트 양식', color: 'blue', icon: 'fa-table',
    headerRows: 1,
    fields: {
        grade_year: 'A', class: 'B', number: 'C', name: 'D',
        kor_subject: 'E', kor_common_raw: 'F', kor_select_raw: 'G',
        kor_std: 'H', kor_pct: 'I', kor_grade: 'J',
        math_raw: 'K', eng_grade: 'L',
    },
});

const HEADER = ['학년', '반', '번호', '이름', '국어선택', '공통', '선택', '표준점수', '백분위', '등급', '수학원점수', '영어등급'];

async function parse(rows) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('성적').addRows([HEADER, ...rows]);
    return new GradeDataParser(schema).parse(wb, '성적');
}

describe('GradeDataParser.parse', () => {
    let students;

    beforeAll(async () => {
        students = await parse([
            [3, 1, 1, '  홍길동  ', '언어와 매체', 60, 25, 130, 95, 2, 88, 1],
            [3, 1, 2, '', '화법과 작문', 50, 20, 120, 80, 4, 70, 3],   // 이름 없음
            [3, 1, 3, '김철수', '화법과 작문', 55, '', 128, 92, 3, '', ''],
            [3, 2, 4, '이영희', '언어와 매체', '', '', 100, 50, 6, 40, 5],
        ]);
    });

    // 이름 칸은 그 행이 학생인지 아닌지를 가르는 기준이다. 빈 행이나 소계 행이
    // 학생으로 섞이면 인원수와 평균이 전부 어긋난다.
    it('이름이 없는 행은 학생으로 세지 않는다', () => {
        expect(students).toHaveLength(3);
        expect(students.map(s => s.name)).toEqual(['홍길동', '김철수', '이영희']);
    });

    it('머리글 행만큼 건너뛴다', () => {
        expect(students[0].grade_year).toBe('3');
        expect(students[0].name).not.toBe('이름');
    });

    it('이름의 앞뒤 공백을 지운다', () => {
        expect(students[0].name).toBe('홍길동');
    });

    it('열을 과목별로 묶어 넣는다', () => {
        const s = students[0];
        expect(s.class).toBe('1');
        expect(s.number).toBe('1');
        expect(s.korean.subject).toBe('언어와 매체');
        expect(s.korean.std).toBe(130);
        expect(s.korean.pct).toBe(95);
        expect(s.korean.grade).toBe(2);
        expect(s.math.raw).toBe(88);
        expect(s.english.grade).toBe(1);
    });

    describe('원점수 열이 없는 양식', () => {
        // 대교협 같은 일부 양식은 국어·수학 원점수를 공통과 선택으로 나눠 준다.
        it('공통과 선택을 더해 원점수를 채운다', () => {
            expect(students[0].korean.raw).toBe(85); // 60 + 25
        });

        // 한쪽만 있는 경우 없는 쪽을 0으로 보고 더한다. null로 물들이면
        // 선택과목을 응시하지 않은 학생의 공통 점수까지 사라진다.
        it('한쪽만 있으면 있는 쪽만 더한다', () => {
            expect(students[1].korean.common_raw).toBe(55);
            expect(students[1].korean.select_raw).toBeNull();
            expect(students[1].korean.raw).toBe(55);
        });

        // 양쪽 다 없으면 0이 아니라 null이다. 0이면 0점을 받은 것으로 읽혀
        // 평균과 등급 분포가 아래로 끌려 내려간다.
        it('양쪽 다 없으면 null이다', () => {
            expect(students[2].korean.raw).toBeNull();
        });
    });

    describe('값이 비어 있을 때', () => {
        it('빈 칸은 null이다 (0이 아니다)', () => {
            expect(students[1].math.raw).toBeNull();
            expect(students[1].english.grade).toBeNull();
        });

        it('양식에 없는 항목도 null이다', () => {
            // 이 양식에는 탐구와 한국사 열이 아예 없다
            expect(schema.supports('inq1_raw')).toBe(false);
            expect(students[0].inquiry1.raw).toBeNull();
            expect(students[0].hist.grade).toBeNull();
            expect(students[0].inquiry1.subject).toBe('');
        });
    });

    it('학생이 없으면 빈 배열이다', async () => {
        expect(await parse([])).toEqual([]);
    });

    it('숫자로 읽을 수 없는 점수는 null이다', async () => {
        const [s] = await parse([[3, 1, 1, '결시생', '언어와 매체', '결시', '', '', '', '', '', '']]);
        expect(s.korean.common_raw).toBeNull();
        expect(s.korean.raw).toBeNull();
    });
});
