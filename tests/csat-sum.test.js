import {beforeEach, describe, expect, it} from 'vitest';
import {_getCsatRawSums, getCsatSubjects, rankCsatSchool, resetCsatSubjects, setCsatSubjects} from '../src/js/report/report-csat-sum.js';
import {computeRenderCache} from '../src/js/report/report-cache.js';

beforeEach(() => resetCsatSubjects());

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

    it('탐구1·2가 같은 과목이면 한 번만 넣는다', () => {
        const s = student(3, 4, 5, 1, 1);
        s.inquiry1.subject = s.inquiry2.subject = '생활과 윤리';
        const r = _getCsatRawSums(s);
        expect(r.sum2).toBe(4);   // 탐구1 1등급 + 국어 3등급
        expect(r.sum2_subj).toBe('탐구1+국어');
        expect(r.sum4).toBe(13);
        expect(r.sum5).toBeNull(); // 후보가 네 과목뿐이다
    });

    it('같은 과목인데 탐구1 등급이 없으면 탐구2 등급을 쓴다', () => {
        const s = student(3, 4, 5, null, 2);
        s.inquiry1 = {subject: '생활과 윤리', raw: 45};
        s.inquiry2.subject = '생활과 윤리';
        const r = _getCsatRawSums(s);
        expect(r.sum2).toBe(5);
        expect(r.sum2_subj).toBe('탐구1+국어');
        expect(r.sum5).toBeNull();
    });

    it('과목명이 달라 별개 과목이면 둘 다 넣는다', () => {
        const s = student(3, 4, 5, 1, 1);
        s.inquiry1.subject = '생활과 윤리';
        s.inquiry2.subject = '사회·문화';
        expect(_getCsatRawSums(s).sum2).toBe(2);
    });

    it('소수 등급은 세지 않는다', () => {
        const r = _getCsatRawSums(student(2.5, 1, 3, null, null));
        expect(r.sum2).toBe(4);   // 1등급 + 3등급
        expect(r.sum3).toBeNull();
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

    it('탐구가 없으면 기본은 제외하고, 옵션을 켜면 국어+수학으로 넣는다', () => {
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

describe('n합에 넣을 과목 선택', () => {
    const pick = (...keys) => new Set(keys);

    it('기본은 국어·수학·영어·탐구 2과목 합이라 5합까지 나온다', () => {
        expect(_getCsatRawSums(student(1, 3, 2, 4, 5)).sum5).toBe(15);
    });

    it('영어를 빼면 나머지 넷에서 더하고 5합은 없다', () => {
        const r = _getCsatRawSums(student(3, 4, 1, 2, 5), pick('korean', 'math', 'inquiry_sum'));
        expect(r.sum2).toBe(5);
        expect(r.sum2_subj).toBe('탐구1+국어');
        expect(r.sum4).toBe(14);
        expect(r.sum5).toBeNull();
    });

    it('탐구 1과목은 두 탐구 중 등급이 좋은 하나만 넣는다', () => {
        const r = _getCsatRawSums(student(3, 4, 5, 6, 2), pick('korean', 'math', 'english', 'inquiry_top1'));
        expect(r.sum2).toBe(5);
        expect(r.sum2_subj).toBe('탐구+국어');
        expect(r.sum4).toBe(14);
        expect(r.sum5).toBeNull();
    });

    it('탐구 평균은 반올림·절사를 따로 한다 (2와 3 → 2.5)', () => {
        const s = student(5, 6, 7, 2, 3);
        const round = _getCsatRawSums(s, pick('korean', 'math', 'english', 'inquiry_avg_round'));
        const floor = _getCsatRawSums(s, pick('korean', 'math', 'english', 'inquiry_avg_floor'));
        expect(round.sum2).toBe(8);
        expect(round.sum2_subj).toBe('탐구평균+국어');
        expect(floor.sum2).toBe(7);
        expect(round.sum5).toBeNull();
        expect(floor.sum4).toBe(20);
    });

    it('탐구 평균은 한 과목만 본 학생이면 그 등급을 쓴다', () => {
        const r = _getCsatRawSums(student(3, null, null, null, 4), pick('korean', 'inquiry_avg_round'));
        expect(r.sum2).toBe(7);
    });

    it('탐구 제외면 탐구를 넣지 않는다', () => {
        const r = _getCsatRawSums(student(3, 4, 5, 1, 1), pick('korean', 'math', 'english'));
        expect(r.sum3).toBe(12);
        expect(r.sum4).toBeNull();
    });

    it('탐구 방식은 하나만 남는다', () => {
        setCsatSubjects(['korean', 'inquiry_top1', 'inquiry_sum']);
        expect([...getCsatSubjects()]).toEqual(['korean', 'inquiry_top1']);
    });

    it('아무것도 없으면 모든 합이 null이다', () => {
        const r = _getCsatRawSums(student(1, 1, 1, 1, 1), pick());
        expect([r.sum2, r.sum3, r.sum4, r.sum5]).toEqual([null, null, null, null]);
    });

    it('기본 인자는 현재 선택이고, 캐시를 다시 만들어도 같은 결과다', () => {
        const data = [student(1, 3, 2, 4, 5), student(2, 2, null, 1, 3)];
        setCsatSubjects(['korean', 'math', 'english']);
        const direct = data.map(s => _getCsatRawSums(s));
        expect(direct[0].sum3).toBe(6);
        expect(direct[0].sum4).toBeNull();
        expect(computeRenderCache(data, 'raw').csatSums).toEqual(direct);
    });
});

describe('n합 메모', () => {
    it('같은 학생·같은 선택이면 다시 계산하지 않고 같은 결과를 준다', async () => {
        const {csatSumsOf} = await import('../src/js/report/report-csat-sum.js');
        const s = student(1, 3, 2, 4, 5);
        const a = csatSumsOf(s);
        expect(csatSumsOf(s)).toBe(a);
        setCsatSubjects(['korean', 'math']);
        const b = csatSumsOf(s);
        expect(b).not.toBe(a);
        expect(b.sum3).toBeNull();
        resetCsatSubjects();
        expect(csatSumsOf(s)).toBe(a);
    });
});
