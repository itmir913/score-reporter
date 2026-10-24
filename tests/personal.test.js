import {describe, expect, it} from 'vitest';
import {changeText, changeVsPrev, csatTimeline, strengths, 과와} from '../src/js/trend/personal.js';
import {_getCsatRawSums} from '../src/js/report/report-csat-sum.js';

/* 학생 한 명 안에서의 비교. 합성 자료만 쓴다. */
const sc = (subject, pct, grade, raw = 50) => ({subject, raw, std: null, pct, grade});
const blank = (subject = '') => ({subject, raw: null, std: null, pct: null, grade: null});
const row = (key, s) => ({key, student: s});
const stu = (o) => ({korean: blank(), math: blank(), english: {grade: null}, inquiry1: blank(), inquiry2: blank(), hist: {grade: null}, ...o});

describe('직전 응시 회차 대비', () => {
    it('결시 회차를 건너뛰고 응시한 가장 가까운 앞 회차와 견준다', () => {
        const rows = [
            row('3', stu({korean: sc('화법과 작문', 80, 3)})),
            row('4', null),
            row('6', stu({korean: blank('화법과 작문')})),
            row('9', stu({korean: sc('화법과 작문', 86, 2)})),
        ];
        const c = changeVsPrev(rows, 'korean');
        expect(c[0].note).toBe('first');
        expect(c[1]).toBeNull();
        expect(c[2].note).toBe('absent');
        expect(c[3]).toEqual({pct: 6, grade: 1, note: null});
        expect(changeText(c[3])).toBe('백분위 ▲6 · 등급 ▲1');
    });

    it('국어·수학은 선택과목이 바뀌면 변화로 치지 않는다. 과목명이 없는 쪽이 있으면 칸끼리 견준다', () => {
        const a = [row('3', stu({math: sc('미적분', 70, 4)})), row('6', stu({math: sc('확률과 통계', 80, 3)}))];
        expect(changeVsPrev(a, 'math')[1].note).toBe('changed');
        const b = [row('3', stu({math: sc('', 70, 4)})), row('6', stu({math: sc('확률과 통계', 80, 3)}))];
        expect(changeVsPrev(b, 'math')[1]).toEqual({pct: 10, grade: 1, note: null});
    });

    it('탐구는 칸이 아니라 과목명으로 짝을 찾는다', () => {
        const rows = [
            row('3', stu({inquiry1: sc('물리학Ⅰ', 60, 5), inquiry2: sc('화학Ⅰ', 70, 4)})),
            row('6', stu({inquiry1: sc('화학Ⅰ', 75, 4), inquiry2: sc('지구과학Ⅰ', 80, 3)})),
        ];
        expect(changeVsPrev(rows, 'inquiry1')[1]).toEqual({pct: 5, grade: 0, note: null});
        expect(changeVsPrev(rows, 'inquiry2')[1].note).toBe('changed');
        expect(changeText(changeVsPrev(rows, 'inquiry1')[1])).toBe('백분위 ▲5 · 등급 변화 없음');
    });

    it('탐구 과목명이 한쪽이라도 없으면 같은 칸끼리 짝을 맞춘다', () => {
        const rows = [
            row('3', stu({inquiry1: sc('', 60, 5), inquiry2: sc('', 70, 4)})),
            row('6', stu({inquiry1: sc('화학Ⅰ', 75, 4), inquiry2: sc('지구과학Ⅰ', 80, 3)})),
        ];
        expect(changeVsPrev(rows, 'inquiry1')[1]).toEqual({pct: 15, grade: 1, note: null});
        expect(changeVsPrev(rows, 'inquiry2')[1]).toEqual({pct: 10, grade: 1, note: null});
    });

    it('탐구1·2가 같은 과목이면 탐구1 줄에 합쳐 적고 탐구2 줄은 「탐구1과 같은 과목」이다', () => {
        const rows = [
            row('3', stu({inquiry1: sc('생활과 윤리', 60, 5)})),
            row('6', stu({inquiry1: {subject: '생활과 윤리', raw: 40, pct: null, grade: 4}, inquiry2: sc('생활과 윤리', 70, 4)})),
        ];
        const c1 = changeVsPrev(rows, 'inquiry1')[1];
        expect(c1).toEqual({pct: 10, grade: 1, note: null});
        expect(changeText(changeVsPrev(rows, 'inquiry2')[1])).toBe('탐구1과 같은 과목');
    });

    it('백분위가 없는 회차는 등급만 견주고 「백분위 없음」을 적는다. 영어·한국사는 등급만 본다', () => {
        const rows = [row('3', stu({korean: sc('화법과 작문', 80, 3), english: {grade: 3}})), row('가채점', stu({korean: sc('화법과 작문', null, 2), english: {grade: 2}}))];
        expect(changeText(changeVsPrev(rows, 'korean')[1])).toBe('등급 ▲1 · 백분위 없음');
        expect(changeVsPrev(rows, 'english')[1]).toEqual({pct: null, grade: 1, note: null});
    });

    it('0점은 0점(응시)으로 견준다', () => {
        const rows = [row('3', stu({korean: sc('화법과 작문', 10, 8, 20)})), row('6', stu({korean: sc('화법과 작문', 0, 9, 0)}))];
        expect(changeVsPrev(rows, 'korean')[1]).toEqual({pct: -10, grade: -1, note: null});
        expect(changeText(changeVsPrev(rows, 'korean')[1])).toBe('백분위 ▼10 · 등급 ▼1');
    });
});

describe('강약점', () => {
    it('국어·수학·탐구를 백분위 순으로, 영어·한국사는 등급만 따로 둔다', () => {
        const r = strengths(stu({korean: sc('화법과 작문', 70, 4), math: sc('미적분', 92, 2), inquiry1: sc('물리학Ⅰ', 81, 3), english: {raw: 85, grade: 2}, hist: {raw: 40, grade: 2}}));
        expect(r.ranked.map(x => x.area)).toEqual(['math', 'inquiry1', 'korean']);
        expect(r.others.map(x => [x.area, x.grade])).toEqual([['english', 2], ['hist', 2]]);
    });

    it('이웃 차가 기준 이하이면 ≈ 표시만 하고 연쇄로 묶지 않는다(92·88·84)', () => {
        const r = strengths(stu({korean: sc('화법과 작문', 84, 2), math: sc('미적분', 92, 2), inquiry1: sc('물리학Ⅰ', 88, 2)}));
        expect(r.ranked.map(x => x.pct)).toEqual([92, 88, 84]);
        expect(r.ranked.map(x => x.similarToNext)).toEqual([true, true, false]);
    });

    it('응시하지 않은 과목은 제외하고, 백분위 없는 과목은 따로 적는다', () => {
        const r = strengths(stu({korean: sc('화법과 작문', 80, 3), math: blank('미적분'), inquiry1: sc('물리학Ⅰ', null, 4)}));
        expect(r.ranked.map(x => x.area)).toEqual(['korean']);
        expect(r.others).toEqual([{area: 'inquiry1', label: '탐구1', subject: '물리학Ⅰ', grade: 4, noPct: true}]);
    });

    it('탐구 두 과목 차가 기준을 넘으면 그 차를 알린다. 같은 과목이면 하나로 본다', () => {
        expect(strengths(stu({inquiry1: sc('물리학Ⅰ', 90, 2), inquiry2: sc('화학Ⅰ', 60, 5)})).inquiryGap).toBe(30);
        expect(strengths(stu({inquiry1: sc('물리학Ⅰ', 90, 2), inquiry2: sc('화학Ⅰ', 87, 2)})).inquiryGap).toBeNull();
        const same = strengths(stu({inquiry1: sc('생활과 윤리', 80, 3), inquiry2: sc('생활과 윤리', 60, 5)}));
        expect(same.ranked.filter(x => x.area.startsWith('inquiry'))).toHaveLength(1);
        expect(same.inquiryGap).toBeNull();
    });
});

describe('회차별 수능최저', () => {
    const g = (subject, grade) => ({subject, raw: 50, pct: 50, grade});

    it('회차마다 선택한 과목으로 n합을 내고, 결시 회차와 등급 없는 회차를 구분한다', () => {
        const pick = new Set(['korean', 'math', 'english', 'inquiry_sum']);
        const rows = [
            row('3', stu({korean: g('화법과 작문', 2), math: g('미적분', 3), english: {raw: 80, grade: 2}, inquiry1: g('물리학Ⅰ', 1), inquiry2: g('화학Ⅰ', 4)})),
            row('4', null),
            row('가채점', stu({korean: {subject: '화법과 작문', raw: 80, grade: null}})),
        ];
        const t = csatTimeline(rows, s => _getCsatRawSums(s, pick));
        expect(t[0].sums.sum2).toBe(3);
        expect(t[0].sums.sum5).toBe(12);
        expect(t[1]).toEqual({absent: true});
        expect(t[2].noGrade).toBe(true);
        expect(t[2].sums.sum2).toBeNull();
    });

    it('과목이 모자라면 그 n합은 null 이고, 탐구 같은 과목은 탐구1 칸에만 적는다', () => {
        const pick = new Set(['korean', 'math', 'english', 'inquiry_sum']);
        const rows = [row('3', stu({korean: g('화법과 작문', 2), inquiry1: g('생활과 윤리', 3), inquiry2: g('생활과 윤리', 3)}))];
        const [t] = csatTimeline(rows, s => _getCsatRawSums(s, pick));
        expect(t.grades.inquiry1).toBe(3);
        expect(t.grades.inquiry2).toBeNull();
        expect(t.sums.sum2).toBe(5);
        expect(t.sums.sum3).toBeNull();
    });
});

describe('과와', () => {
    it('받침에 따라 과·와를 선택하고, 로마 숫자는 읽는 소리로 본다', () => {
        expect(과와('국어')).toBe('와');
        expect(과와('화법과 작문')).toBe('과');
        expect(과와('물리학Ⅰ')).toBe('과');
        expect(과와('화학Ⅱ')).toBe('와');
        expect(과와('미적분')).toBe('과');
    });
});
