import {describe, expect, it, vi} from 'vitest';
import {avgOf, colToIdx, dlBlob, escapeAttr, fmt} from '../src/js/utils.js';

describe('colToIdx: 엑셀 열 이름 → 0-based 인덱스', () => {
    it('한 글자 열을 변환한다', () => {
        expect(colToIdx('A')).toBe(0);
        expect(colToIdx('B')).toBe(1);
        expect(colToIdx('Z')).toBe(25);
    });

    it('두 글자 열은 26진수처럼 이어진다', () => {
        expect(colToIdx('AA')).toBe(26);
        expect(colToIdx('AB')).toBe(27);
        expect(colToIdx('BA')).toBe(52);
    });

    // 스키마에서 "이 양식에는 이 항목이 없다"를 빈 칸으로 표현한다.
    // null이 아니라 0을 돌려주면 A열을 가리키게 되어 엉뚱한 값을 읽는다.
    it('빈 값은 null이다 (0이 아니다)', () => {
        expect(colToIdx('')).toBeNull();
        expect(colToIdx('   ')).toBeNull();
        expect(colToIdx(null)).toBeNull();
        expect(colToIdx(undefined)).toBeNull();
    });
});

describe('avgOf: 결측치를 뺀 평균', () => {
    it('평균을 낸다', () => {
        expect(avgOf([1, 2, 3])).toBe(2);
        expect(avgOf([10])).toBe(10);
    });

    it('null과 undefined는 분모에서도 빠진다', () => {
        expect(avgOf([1, null, 3])).toBe(2);
        expect(avgOf([2, undefined, 4])).toBe(3);
    });

    it('셀 값이 하나도 없으면 null이다', () => {
        expect(avgOf([])).toBeNull();
        expect(avgOf([null, undefined])).toBeNull();
    });

    it('0은 결측치가 아니라 점수 0점으로 센다', () => {
        expect(avgOf([0, 100])).toBe(50);
    });
});

describe('fmt: 표에 찍을 숫자 문자열', () => {
    it('기본 소수점 한 자리로 반올림한다', () => {
        expect(fmt(3.14159)).toBe('3.1');
        expect(fmt(5)).toBe('5.0');
    });

    it('자릿수를 지정할 수 있다', () => {
        expect(fmt(3.14159, 2)).toBe('3.14');
        expect(fmt(3.7, 0)).toBe('4');
    });

    it('값이 없으면 하이픈을 찍는다', () => {
        expect(fmt(null)).toBe('-');
        expect(fmt(undefined)).toBe('-');
        expect(fmt(NaN)).toBe('-');
    });
});

describe('escapeAttr: HTML 속성 이스케이프', () => {
    // 학생 이름이 그대로 onclick="..." 속성 안에 들어간다.
    // 따옴표가 새지 않아야 마크업이 깨지지 않는다.
    it('속성을 깨뜨리는 문자를 막는다', () => {
        expect(escapeAttr('"')).toBe('&quot;');
        expect(escapeAttr("'")).toBe('&#39;');
        expect(escapeAttr('<script>')).toBe('&lt;script&gt;');
    });

    it('앰퍼샌드를 먼저 바꿔 이중 이스케이프를 피한다', () => {
        expect(escapeAttr('a&b')).toBe('a&amp;b');
        expect(escapeAttr('&quot;')).toBe('&amp;quot;');
    });

    it('빈 값은 빈 문자열이다', () => {
        expect(escapeAttr(null)).toBe('');
        expect(escapeAttr(undefined)).toBe('');
    });

    it('문자열이 아닌 값도 처리한다', () => {
        expect(escapeAttr(3)).toBe('3');
        expect(escapeAttr(0)).toBe('0');
    });

    it('평범한 한글 이름은 그대로 둔다', () => {
        expect(escapeAttr('김서준')).toBe('김서준');
    });
});

describe('dlBlob: 파일 내려받기', () => {
    it('a 태그를 만들어 클릭하고 다시 치운다', () => {
        const createObjectURL = vi.fn(() => 'blob:fake');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', {createObjectURL, revokeObjectURL});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        });

        dlBlob(new Blob(['x']), '성적.xlsx');

        expect(click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
        // 임시로 붙인 a 태그가 문서에 남아 있으면 안 된다
        expect(document.querySelectorAll('a[download]')).toHaveLength(0);

        click.mockRestore();
        vi.unstubAllGlobals();
    });
});
