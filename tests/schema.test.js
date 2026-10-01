import {describe, expect, it} from 'vitest';
import {
    convertNumberToRoman,
    convertRomanToNumber,
    ensureNumericOrZero,
    FormatSchema,
    numberToRomanKeepSpaces,
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

    // 읽을 때(num)와 같은 규칙: 앞부분만 숫자인 값은 숫자가 아니다
    it('앞부분만 숫자인 값은 빈 문자열이다', () => {
        expect(ensureNumericOrZero(S, '85abc')).toBe('');
        expect(ensureNumericOrZero(S, '1,234')).toBe('');
        expect(ensureNumericOrZero(S, NaN)).toBe('');
        expect(ensureNumericOrZero(S, '85점')).toBe(85);
    });
});

describe('FormatSchema.num: 점수 칸 읽기', () => {
    const schema = new FormatSchema({id: 't', label: 't', headerRows: 0, fields: {kor_raw: 'A'}});
    const read = (v) => schema.num([v], 'kor_raw');

    it('소수와 뒤에 붙은 점·% 는 숫자로 읽는다', () => {
        expect(read('85')).toBe(85);
        expect(read('85.5')).toBe(85.5);
        expect(read('-3')).toBe(-3);
        expect(read(' 85점 ')).toBe(85);
        expect(read('85 %')).toBe(85);
        expect(read('0')).toBe(0);
        expect(read(0)).toBe(0);
        expect(read(72.5)).toBe(72.5);
    });

    // parseFloat 는 앞부분만 읽어 "1,234" 가 1점, "85abc" 가 85점, "1e2" 가 100점이 되었다
    it('그 밖의 글자는 null 이다', () => {
        for (const v of ['1,234', '85abc', '1e2', 'Infinity', '0x1A', ' ', '결시', '85점점']) {
            expect(read(v)).toBeNull();
        }
        expect(read('')).toBeNull();
        expect(read(Infinity)).toBeNull();
        expect(read(NaN)).toBeNull();
    });
});

describe('numberToRomanKeepSpaces: 대교협 과목명', () => {
    it('끝의 숫자 1·2 만 로마자로 바꾸고 나머지는 그대로 둔다', () => {
        expect(numberToRomanKeepSpaces(S, '물리학1')).toBe('물리학Ⅰ');
        expect(numberToRomanKeepSpaces(S, '생명과학2')).toBe('생명과학Ⅱ');
        expect(numberToRomanKeepSpaces(S, '생활과 윤리')).toBe('생활과 윤리');
        expect(numberToRomanKeepSpaces(S, '물리학Ⅰ')).toBe('물리학Ⅰ');
        expect(numberToRomanKeepSpaces(S, '탐구11')).toBe('탐구11');
        expect(numberToRomanKeepSpaces(S, '물리학I')).toBe('물리학I');
        expect(numberToRomanKeepSpaces(S, '')).toBe('');
        expect(numberToRomanKeepSpaces(S, null)).toBe('');
    });

    // convertNumberToRoman 은 공백까지 지운다. 그 동작은 꿈꾸GO 가 쓰므로 바꾸지 않는다
    it('convertNumberToRoman 은 예전처럼 공백을 지운다', () => {
        expect(convertNumberToRoman(S, '생활과 윤리')).toBe('생활과윤리');
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

describe('꿈꾸GO 탐구영역 분류', () => {
    const domain = (sub1, sub2) => SCHEMAS.kkumkugo.customGetters.inq_domain(
        {inquiry1: {subject: sub1}, inquiry2: {subject: sub2}}, '');

    // 공식 과목명은 띄어 쓴다. 붙여 쓴 키워드와만 비교하면 사회탐구로 빠졌다.
    it('띄어 쓴 직업탐구 과목명도 직업탐구로 본다', () => {
        expect(domain('성공적인 직업생활', '인간 발달')).toBe('직업탐구');
        expect(domain('농업 기초 기술', '공업 일반')).toBe('직업탐구');
        expect(domain('상업 경제', '')).toBe('직업탐구');
        expect(domain('수산·해운 산업 기초', '')).toBe('직업탐구');
    });

    it('과학·사회 분류는 그대로다', () => {
        expect(domain('물리학Ⅰ', '화학Ⅰ')).toBe('과학탐구');
        expect(domain('생활과 윤리', '지구과학Ⅰ')).toBe('사회과학탐구');
        expect(domain('생활과 윤리', '사회·문화')).toBe('사회탐구');
        expect(domain('', '')).toBe('');
    });
});
