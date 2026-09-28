import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

/* jsdom 에는 canvas 가 없어 Chart.js 가 그리지 못한다. 넘겨받은 설정만 보관한다. */
vi.mock('chart.js/auto', () => ({
    default: class {
        constructor(ctx, cfg) {
            this.cfg = cfg;
        }

        destroy() {
        }
    }
}));

const {ST} = await import('../src/js/main.js');
const {renderAll} = await import('../src/js/report.js');

/* 통계 화면이 보여주는 숫자를 실제 마크업 위에서 본다. */

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    HTMLCanvasElement.prototype.getContext = () => ({});
    ST.charts = {};
});

/** 과목 점수. raw 가 null 이면 그 과목은 결시다. */
const score = (subject, raw, grade = null) => ({
    subject, raw, std: raw === null ? null : raw + 50, pct: raw === null ? null : raw, grade,
    common_raw: null, select_raw: null,
});

const student = (name, number, {korean, math, inquiry1, inquiry2, engGrade = null} = {}) => ({
    name, class: '1', number: String(number),
    korean: korean ?? score('화법과 작문', null),
    math: math ?? score('미적분', null),
    english: {raw: null, std: null, pct: null, grade: engGrade},
    inquiry1: inquiry1 ?? score('물리학Ⅰ', null),
    inquiry2: inquiry2 ?? score('화학Ⅰ', null),
    hist: {raw: null, std: null, pct: null, grade: null},
    fl2: {subject: '', raw: null, std: null, pct: null, grade: null},
});

const cellTexts = (tbodyId) => [...document.getElementById(tbodyId).querySelectorAll('tr')]
    .map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()));

describe('평균 소수점 반올림', () => {
    // 1607/20 = 80.35 는 2진수로 80.3499… 라 toFixed(1) 이 80.3 을 냈다.
    const twenty = () => Array.from({length: 20}, (_, i) =>
        student(`학생${i}`, i + 1, {korean: score('화법과 작문', i === 0 ? 87 : 80, 2)}));

    it('선택과목 평균 원점수는 80.35 를 80.4 로 올린다', () => {
        ST.data = twenty();
        renderAll();
        const row = cellTexts('kor-select-stats').find(r => r[0] === '화법과 작문');
        expect(row[2]).toBe('80.4');
    });

    it('상위 20% 평균도 80.35 를 80.4 로 올린다', () => {
        // 87 한 명과 80 열아홉 명: 상위 4명 경계가 80 이라 동점자 전원이 들어가 평균 80.35
        ST.data = twenty();
        renderAll();
        expect(document.getElementById('stat-cards').textContent).toContain('80.4');
    });
});
