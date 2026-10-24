import {describe, expect, it} from 'vitest';
import {compositeScore, inquiryAvg, lacksInquiryOnly} from '../src/js/core/aggregate.js';

const subj = (subject, raw, std = null, pct = null) => ({subject, raw, std, pct, grade: null});
const st = ({kor = subj('화법과 작문', 80, 120, 80), math = subj('미적분', 70, 125, 85), inq1, inq2} = {}) => ({
    korean: kor, math, inquiry1: inq1 ?? subj('', null), inquiry2: inq2 ?? subj('', null),
});

describe('inquiryAvg', () => {
    it('두 과목이면 평균, 반올림하지 않는다', () => {
        expect(inquiryAvg(st({inq1: subj('물리학Ⅰ', 40), inq2: subj('화학Ⅰ', 39)}), 'raw')).toBe(39.5);
    });

    it('한 과목이면 그 값', () => {
        expect(inquiryAvg(st({inq1: subj('물리학Ⅰ', 40)}), 'raw')).toBe(40);
    });

    it('탐구1이 비고 탐구2만 있으면 탐구2 값', () => {
        expect(inquiryAvg(st({inq2: subj('화학Ⅰ', 33)}), 'raw')).toBe(33);
    });

    it('하나도 없으면 null', () => {
        expect(inquiryAvg(st(), 'raw')).toBeNull();
    });

    it('기준마다 따로 센다: 표준점수는 탐구1에만 있으면 탐구1 하나로 본다', () => {
        const s = st({inq1: subj('물리학Ⅰ', 40, 60), inq2: subj('화학Ⅰ', 30)});
        expect(inquiryAvg(s, 'std')).toBe(60);
        expect(inquiryAvg(s, 'raw')).toBe(35);
    });

    it('과목명이 같으면 탐구1 하나로 본다', () => {
        expect(inquiryAvg(st({inq1: subj('물리학Ⅰ', 40), inq2: subj('물리학Ⅰ', 30)}), 'raw')).toBe(40);
    });

    it('0점은 0점이다', () => {
        expect(inquiryAvg(st({inq1: subj('물리학Ⅰ', 40), inq2: subj('화학Ⅰ', 0)}), 'raw')).toBe(20);
    });
});

describe('compositeScore', () => {
    it('국어 + 수학 + 탐구평균', () => {
        expect(compositeScore(st({inq1: subj('물리학Ⅰ', 40), inq2: subj('화학Ⅰ', 39)}), 'raw')).toBe(80 + 70 + 39.5);
    });

    it('한 과목 응시자는 그 과목 값이 들어가 두 과목 응시자와 같은 척도다', () => {
        const one = compositeScore(st({inq1: subj('물리학Ⅰ', 40)}), 'raw');
        const two = compositeScore(st({inq1: subj('물리학Ⅰ', 40), inq2: subj('화학Ⅰ', 40)}), 'raw');
        expect(one).toBe(two);
    });

    it('국어나 수학이 없으면 null', () => {
        expect(compositeScore(st({kor: subj('화법과 작문', null), inq1: subj('물리학Ⅰ', 40)}), 'raw')).toBeNull();
    });

    it('탐구가 없으면 기본 null, 옵션을 켜면 국어 + 수학', () => {
        expect(compositeScore(st(), 'raw')).toBeNull();
        expect(compositeScore(st(), 'raw', {includeNoInquiry: true})).toBe(150);
        expect(lacksInquiryOnly(st(), 'raw')).toBe(true);
        expect(lacksInquiryOnly(st({inq1: subj('물리학Ⅰ', 40)}), 'raw')).toBe(false);
    });

    it('원점수만 있는 학생은 표준점수 합이 없다', () => {
        const s = st({kor: subj('화법과 작문', 80), math: subj('미적분', 70), inq1: subj('물리학Ⅰ', 40)});
        expect(compositeScore(s, 'raw')).toBe(190);
        expect(compositeScore(s, 'std')).toBeNull();
        expect(lacksInquiryOnly(s, 'std')).toBe(false);
    });
});

describe('탐구1·2가 같은 과목일 때 (D2)', () => {
    it('그 기준 값이 탐구1에 없으면 탐구2 값을 쓴다', () => {
        const s = st({inq1: subj('물리학Ⅰ', 40, null), inq2: subj('물리학Ⅰ', 40, 65)});
        expect(inquiryAvg(s, 'raw')).toBe(40);
        expect(inquiryAvg(s, 'std')).toBe(65);
        expect(lacksInquiryOnly(s, 'std')).toBe(false);
    });

    it('탐구1 값이 있으면 탐구1 값을 쓴다', () => {
        const s = st({inq1: subj('물리학Ⅰ', 40, 60), inq2: subj('물리학Ⅰ', 30, 65)});
        expect(inquiryAvg(s, 'std')).toBe(60);
    });
});
