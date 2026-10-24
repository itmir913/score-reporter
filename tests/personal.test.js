import {describe, expect, it} from 'vitest';
import {changeText, changeVsPrev} from '../src/js/trend/personal.js';

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
