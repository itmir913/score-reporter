import {describe, expect, it} from 'vitest';
import {_getCsatRawSums, rankCsatSchool} from '../src/js/report/report-csat-sum.js';

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

describe('rankCsatSchool: 전교 석차(국어+수학+탐구평균)', () => {
    const sc = (raw, std = null, pct = null) => ({raw, std, pct});
    const st = (name, kor, math, inq1, inq2 = sc(null)) => ({
        name, korean: kor, math, inquiry1: {subject: '물리학Ⅰ', ...inq1}, inquiry2: {subject: '화학Ⅰ', ...inq2},
        english: sc(100, 140, 99),
    });
    const names = (ranked) => ranked.map(({s, rank}) => `${rank}:${s.name}`);

    it('탐구 한 과목 응시자는 그 과목 값으로 들어가 두 과목 응시자와 같은 척도다', () => {
        const ranked = rankCsatSchool([
            st('둘', sc(90), sc(80), sc(40), sc(30)),   // 90+80+35 = 205
            st('하나', sc(90), sc(80), sc(40)),          // 90+80+40 = 210
        ]);
        expect(names(ranked)).toEqual(['1:하나', '2:둘']);
    });

    it('빈칸을 0으로 더하지 않는다: 국어가 없으면 석차에서 뺀다', () => {
        const ranked = rankCsatSchool([st('국어없음', sc(null), sc(80), sc(40)), st('응시', sc(50), sc(50), sc(20))]);
        expect(names(ranked)).toEqual(['1:응시']);
    });

    it('원점수만 있는 회차도 석차를 매긴다', () => {
        const ranked = rankCsatSchool([st('가', sc(90), sc(80), sc(40)), st('나', sc(95), sc(80), sc(40))]);
        expect(names(ranked)).toEqual(['1:나', '2:가']);
    });

    it('원점수 합이 같으면 표준점수 합으로, 표준점수가 없는 학생은 그 단계에서 뒤로 간다', () => {
        const ranked = rankCsatSchool([
            st('표없음', sc(90), sc(80), sc(40)),
            st('표있음', sc(90, 130), sc(80, 128), sc(40, 60)),
        ]);
        expect(names(ranked)).toEqual(['1:표있음', '2:표없음']);
    });

    it('세 합이 모두 같으면(없음끼리 같음 포함) 공동순위 1,1,3', () => {
        const ranked = rankCsatSchool([
            st('가', sc(90), sc(80), sc(40)),
            st('나', sc(90), sc(80), sc(40)),
            st('다', sc(80), sc(80), sc(40)),
        ]);
        expect(names(ranked)).toEqual(['1:가', '1:나', '3:다']);
    });

    it('탐구가 없으면 기본은 빼고, 옵션을 켜면 국어+수학으로 넣는다', () => {
        const data = [st('탐구없음', sc(90), sc(80), sc(null)), st('응시', sc(50), sc(50), sc(20))];
        expect(names(rankCsatSchool(data))).toEqual(['1:응시']);
        expect(names(rankCsatSchool(data, {includeNoInquiry: true}))).toEqual(['1:탐구없음', '2:응시']);
    });

    it('영어는 더하지 않는다', () => {
        const a = st('가', sc(90), sc(80), sc(40));
        const b = {...st('나', sc(90), sc(80), sc(40)), english: sc(0)};
        expect(names(rankCsatSchool([a, b]))).toEqual(['1:가', '1:나']);
    });
});
