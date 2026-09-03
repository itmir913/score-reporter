import {describe, expect, it} from 'vitest';
import {
    convertNumberToRoman,
    convertRomanToNumber,
    ensureNumericOrZero,
    FormatSchema,
    removeSpaces,
    SCHEMAS,
} from '../src/js/schema.js';

// 변환 함수들의 첫 인자는 학생 레코드다. 값 변환에는 쓰이지 않아 null을 넘긴다.
const S = null;

describe('ensureNumericOrZero: 점수 칸의 빈 값과 0을 구분한다', () => {
    // 여기서 0을 돌려주면 "응시하지 않음"이 "0점"으로 바뀐다.
    // 양식을 바꿔 내보낼 때 없던 점수가 생겨나므로 반드시 빈 문자열이어야 한다.
    it('값이 없으면 빈 문자열이다', () => {
        expect(ensureNumericOrZero(S, null)).toBe('');
        expect(ensureNumericOrZero(S, undefined)).toBe('');
        expect(ensureNumericOrZero(S, '')).toBe('');
    });

    it('진짜 0점은 숫자 0으로 남는다', () => {
        expect(ensureNumericOrZero(S, 0)).toBe(0);
        expect(ensureNumericOrZero(S, '0')).toBe(0);
    });

    it('문자열 점수를 숫자로 바꾼다', () => {
        expect(ensureNumericOrZero(S, '87')).toBe(87);
        expect(ensureNumericOrZero(S, '72.5')).toBe(72.5);
    });

    it('숫자가 아닌 값은 빈 문자열이다', () => {
        expect(ensureNumericOrZero(S, '결시')).toBe('');
    });
});

describe('과목명 로마자 변환', () => {
    it('끝자리 1과 2를 로마자로 바꾼다', () => {
        expect(convertNumberToRoman(S, '물리학1')).toBe('물리학Ⅰ');
        expect(convertNumberToRoman(S, '생명과학2')).toBe('생명과학Ⅱ');
    });

    it('로마자를 다시 숫자로 되돌린다', () => {
        expect(convertRomanToNumber(S, '물리학Ⅰ')).toBe('물리학1');
        expect(convertRomanToNumber(S, '생명과학Ⅱ')).toBe('생명과학2');
    });

    it('양쪽 변환은 서로의 역이다', () => {
        for (const name of ['물리학1', '화학2', '지구과학1']) {
            expect(convertRomanToNumber(S, convertNumberToRoman(S, name))).toBe(name);
        }
    });

    it('숫자가 안 붙는 과목명은 그대로 둔다', () => {
        expect(convertNumberToRoman(S, '한국지리')).toBe('한국지리');
        expect(convertRomanToNumber(S, '사회·문화')).toBe('사회·문화');
    });

    it('변환 과정에서 공백은 지워진다', () => {
        expect(convertNumberToRoman(S, '물리학 1')).toBe('물리학Ⅰ');
        expect(removeSpaces(S, ' 사회 · 문화 ')).toBe('사회·문화');
    });

    it('빈 값은 빈 문자열이다', () => {
        expect(convertNumberToRoman(S, '')).toBe('');
        expect(convertRomanToNumber(S, null)).toBe('');
        expect(removeSpaces(S, undefined)).toBe('');
    });
});

describe('FormatSchema', () => {
    const schema = new FormatSchema({
        id: 'test', label: '테스트 양식', color: 'blue', icon: 'fa-table',
        headerRows: 1,
        fields: {name: 'A', class: 'B', kor_raw: 'C', kor_grade: 'D'},
    });

    it('열 이름을 인덱스로 미리 바꿔 둔다', () => {
        expect(schema._idx.name).toBe(0);
        expect(schema._idx.kor_grade).toBe(3);
    });

    it('supports로 양식에 있는 항목인지 가린다', () => {
        expect(schema.supports('name')).toBe(true);
        expect(schema.supports('math_std')).toBe(false);
    });

    // 숫자 필드는 생성자가 자동으로 ensureNumericOrZero를 걸어 준다.
    // 이게 빠지면 빈 점수 칸이 0으로 내보내진다.
    it('숫자 필드에 변환기를 자동으로 단다', () => {
        expect(schema.customGetters.kor_raw).toBe(ensureNumericOrZero);
        expect(schema.customGetters.kor_grade).toBe(ensureNumericOrZero);
        expect(schema.customGetters.name).toBeUndefined();
    });
});

describe('SCHEMAS: 실제 양식 정의', () => {
    it('양식이 하나 이상 있고 id와 label을 갖는다', () => {
        const list = Object.values(SCHEMAS);
        expect(list.length).toBeGreaterThan(0);
        for (const s of list) {
            expect(s).toBeInstanceOf(FormatSchema);
            expect(s.id).toBeTruthy();
            expect(s.label).toBeTruthy();
        }
    });

    it('모든 양식이 이름 항목을 갖는다 (파서가 이름으로 빈 행을 거른다)', () => {
        for (const s of Object.values(SCHEMAS)) {
            expect(s.supports('name')).toBe(true);
        }
    });
});
