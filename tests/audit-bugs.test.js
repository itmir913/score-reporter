import {describe, expect, it} from 'vitest';
import {identityKeys} from '../src/js/exams/identity.js';
import {nextGradeGap} from '../src/js/trend/personal.js';
import {computeRenderCache} from '../src/js/report/report-cache.js';
import {examSummary} from '../src/js/trend/trend.js';
import {withUnit} from '../src/js/utils.js';
import {entryOrder} from '../src/js/ui/grid/filters.js';

/* 적대적 코드 감사(2026-10-24)에서 재현된 버그. 합성 자료만 쓴다. */
const blank = (subject = '') => ({subject, raw: null, std: null, pct: null, grade: null});
const stu = (o) => ({korean: blank(), math: blank(), english: {grade: null}, inquiry1: blank(), inquiry2: blank(), hist: {grade: null}, ...o});

describe('감사 버그 재현', () => {
    it('탐구1이 과목명만 있고 점수가 없어도, 같은 과목의 탐구2 점수로 다음 등급을 추정한다', () => {
        const me = stu({inquiry1: {subject: '물리학Ⅰ', raw: 30, grade: 4}});
        const other = stu({inquiry1: blank('물리학Ⅰ'), inquiry2: {subject: '물리학Ⅰ', raw: 40, grade: 3}});
        expect(nextGradeGap({students: [me, other]}, 'inquiry1', me)).toEqual({kind: 'ok', target: 3, gap: 10, min: 40});
    });

    it('등급 0·소수는 영어 상위 20%·선택과목 평균 등급·전교 영어 등급 평균에 들어가지 않는다', () => {
        const data = [
            stu({english: {raw: 85, grade: 0}, korean: {subject: '화법과 작문', raw: 80, grade: 0}}),
            stu({english: {raw: 90, grade: 2}, korean: {subject: '화법과 작문', raw: 70, grade: 3}}),
        ];
        const c = computeRenderCache(data, 'raw');
        expect(c.engGrades).toEqual([2]);
        expect(c.korSubjectStats['화법과 작문'].validGradeCount).toBe(1);
        expect(examSummary({key: '6', students: data}, 'raw').engGrade).toBe(2);
        // 등급 기준의 국어 평균도 같은 규칙(0 은 제외하고 3 만)
        expect(examSummary({key: '6', students: data}, 'grade').kor).toBe(3);
    });

    it('번호·반을 「01」(글자)과 1(숫자)로 다르게 적어도 같은 학생 키가 된다', () => {
        const a = identityKeys({grade_year: '3', class: '01', number: '05', name: '가'});
        const b = identityKeys({grade_year: 3, class: 1, number: 5, name: '가'});
        expect(a.some(k => b.includes(k))).toBe(true);
        const c = identityKeys({grade_year: '3학년', class: '1반', number: '5번', name: '가'});
        expect(c.some(k => b.includes(k))).toBe(true);
        // 숫자가 아닌 반 이름은 그대로 둔다
        expect(identityKeys({grade_year: '3', class: '가반', number: '5'}).some(k => k.includes('가반'))).toBe(true);
    });
});

describe('2차 적대 감사 버그 재현', () => {
    it('반·번호에 단위가 이미 붙어 있으면 다시 붙이지 않는다', () => {
        expect(withUnit('1', '반')).toBe('1반');
        expect(withUnit('1반', '반')).toBe('1반');
        expect(withUnit('5번', '번')).toBe('5번');
        expect(withUnit('', '번')).toBe('');
    });
    it('숫자 열 값 목록에서도 (빈칸)은 맨 뒤다', () => {
        const order = entryOrder({key: 'eng', numeric: true, type: 'number'});
        const entries = [{value: 3, label: '3'}, {value: null, label: '(빈칸)'}, {value: 1, label: '1'}];
        expect([...entries].sort(order).map(e => e.label)).toEqual(['1', '3', '(빈칸)']);
    });
});

describe('김영일 내보내기 학번', async () => {
    const {SCHEMAS} = await import('../src/js/schema.js');
    const make = Object.values(SCHEMAS).find(sc => sc.customGetters?.student_id)?.customGetters.student_id;
    it('반·번호·학년에 단위가 붙어 있어도 그 숫자로 학번을 만든다', () => {
        expect(make({grade_year: '3학년', class: '1반', number: '5번'}, '')).toBe('301005');
        expect(make({grade_year: 3, class: 1, number: 5}, '')).toBe('301005');
        expect(make({grade_year: '3', class: '가반', number: '5'}, '')).toBe('300005');
    });
});
