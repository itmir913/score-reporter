import {describe, expect, it} from 'vitest';
import {computeRenderCache} from '../src/js/report/report-cache.js';

/* 응시 여부는 과목명이 아니라 점수로 판단한다 (L1) */
const sc = (subject, raw = null, grade = null) => ({subject, raw, std: null, pct: null, grade});
const st = (o) => ({korean: sc(''), math: sc(''), english: {}, inquiry1: sc(''), inquiry2: sc(''), ...o});

describe('선택과목 인원', () => {
    it('과목명만 있고 점수가 하나도 없으면 세지 않는다', () => {
        const data = [st({korean: sc('언어와 매체', 80)}), st({korean: sc('언어와 매체')})];
        const c = computeRenderCache(data, 'raw');
        expect(c.korSubjectStats['언어와 매체'].count).toBe(1);
    });

    it('등급만 있어도 응시로 센다', () => {
        const c = computeRenderCache([st({math: sc('미적분', null, 3)})], 'raw');
        expect(c.mathSubjectStats['미적분'].count).toBe(1);
    });

    it('탐구1·2가 같은 과목이면 한 번만 세고, 탐구1에 없는 값은 탐구2에서 가져온다', () => {
        const c = computeRenderCache([st({inquiry1: sc('화학Ⅰ', null, 2), inquiry2: sc('화학Ⅰ', 40, null)})], 'raw');
        const d = c.inqSubjectStats['화학Ⅰ'];
        expect(d.count).toBe(1);
        expect(d.validRawCount).toBe(1);
        expect(d.sumRaw).toBe(40);
        expect(d.validGradeCount).toBe(1);
    });
});
