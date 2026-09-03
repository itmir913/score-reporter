import {describe, expect, it} from 'vitest';
import {_getCsatRawSums, _getScoreSum} from '../src/js/report/report-csat-sum.js';

/** 등급만 담은 학생 레코드를 만든다. null은 "해당 과목 응시 기록 없음". */
const student = (korean, math, english, inquiry1, inquiry2) => ({
    korean: korean === null ? {} : {grade: korean},
    math: math === null ? {} : {grade: math},
    english: english === null ? {} : {grade: english},
    inquiry1: inquiry1 === null ? {} : {grade: inquiry1},
    inquiry2: inquiry2 === null ? {} : {grade: inquiry2},
});

describe('_getCsatRawSums: 수능 최저 n개 합', () => {
    it('가장 좋은 등급부터 n개를 더한다', () => {
        // 국1 수3 영2 탐4 탐5 → 정렬하면 1,2,3,4,5
        const r = _getCsatRawSums(student(1, 3, 2, 4, 5));
        expect(r.sum2).toBe(3);
        expect(r.sum3).toBe(6);
        expect(r.sum4).toBe(10);
        expect(r.sum5).toBe(15);
    });

    it('합에 쓰인 과목 이름을 좋은 등급 순으로 함께 준다', () => {
        const r = _getCsatRawSums(student(1, 3, 2, 4, 5));
        expect(r.sum2_subj).toBe('국어+영어');
        expect(r.sum3_subj).toBe('국어+영어+수학');
    });

    it('과목 수가 모자라면 그 합은 null이다', () => {
        // 두 과목만 응시 → 3합 이상은 만들 수 없다
        const r = _getCsatRawSums(student(2, 3, null, null, null));
        expect(r.sum2).toBe(5);
        expect(r.sum3).toBeNull();
        expect(r.sum4).toBeNull();
        expect(r.sum5).toBeNull();
        expect(r.sum3_subj).toBe('');
    });

    // 등급은 1~9뿐이다. 0이나 범위 밖 값은 결시/오류 표기이므로 합에 넣으면 안 된다.
    it('1~9 밖의 등급은 세지 않는다', () => {
        const r = _getCsatRawSums(student(0, 1, 10, 2, -1));
        expect(r.sum2).toBe(3);   // 1등급 + 2등급
        expect(r.sum3).toBeNull(); // 유효한 등급이 둘뿐이다
    });

    it('등급이 없는 학생은 모든 합이 null이다', () => {
        const r = _getCsatRawSums(student(null, null, null, null, null));
        expect(r.sum2).toBeNull();
        expect(r.sum5).toBeNull();
    });

    it('같은 등급이 여럿이어도 개수만큼 더한다', () => {
        const r = _getCsatRawSums(student(2, 2, 2, 2, 2));
        expect(r.sum2).toBe(4);
        expect(r.sum5).toBe(10);
    });
});

describe('_getScoreSum: 국어+수학+탐구1+탐구2 점수 합', () => {
    const s = {
        korean: {raw: 90, std: 130, pct: 95},
        math: {raw: 80, std: 128, pct: 92},
        english: {raw: 100, std: 140, pct: 99}, // 영어는 합에서 빠진다
        inquiry1: {raw: 45, std: 65, pct: 88},
        inquiry2: {raw: 40, std: 62, pct: 85},
    };

    it('기준별로 네 과목을 더한다', () => {
        expect(_getScoreSum(s, 'raw')).toBe(255);
        expect(_getScoreSum(s, 'std')).toBe(385);
        expect(_getScoreSum(s, 'pct')).toBe(360);
    });

    it('영어는 더하지 않는다', () => {
        // 영어 점수를 0으로 바꿔도 합이 그대로면 애초에 안 더한 것이다
        expect(_getScoreSum({...s, english: {raw: 0}}, 'raw')).toBe(255);
        expect(_getScoreSum({...s, english: {raw: 999}}, 'raw')).toBe(255);
    });

    it('빠진 과목은 건너뛴다', () => {
        expect(_getScoreSum({...s, inquiry2: {}}, 'raw')).toBe(215);
        expect(_getScoreSum({}, 'raw')).toBe(0);
    });

    it('숫자가 아닌 값은 더하지 않는다', () => {
        expect(_getScoreSum({...s, math: {raw: '80'}}, 'raw')).toBe(175);
        expect(_getScoreSum({...s, math: {raw: NaN}}, 'raw')).toBe(175);
    });
});
