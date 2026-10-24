import {describe, expect, it} from 'vitest';
import {GRADE_MAX, GRADE_MIN, isValidGrade} from '../src/js/core/limits.js';

describe('isValidGrade: 등급으로 쓸 수 있는 값', () => {
    it('범위 안 정수만 받는다', () => {
        expect(isValidGrade(GRADE_MIN)).toBe(true);
        expect(isValidGrade(GRADE_MAX)).toBe(true);
        expect(isValidGrade(GRADE_MIN - 1)).toBe(false);
        expect(isValidGrade(GRADE_MAX + 1)).toBe(false);
    });

    it('소수·빈 값·문자열은 등급이 아니다', () => {
        expect(isValidGrade(2.5)).toBe(false);
        expect(isValidGrade(null)).toBe(false);
        expect(isValidGrade(undefined)).toBe(false);
        expect(isValidGrade('2')).toBe(false);
    });
});
