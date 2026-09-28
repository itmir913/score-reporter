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
const {renderAll, setGlobalBasis} = await import('../src/js/report.js');
const {showSelectedSubjectStudents} = await import('../src/js/report/report-modal.js');

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

describe('요약 카드: 응시자가 없는 지표', () => {
    // 대교협(가채점)은 등급 열이 없다. 예전에는 "0.0등급" 을 보여 주었다.
    it('등급이 하나도 없으면 영어 상위 20% 는 - 이다', () => {
        ST.data = [
            student('가', 1, {korean: score('화법과 작문', 90)}),
            student('나', 2, {korean: score('화법과 작문', 70)}),
        ];
        renderAll();
        const card = [...document.querySelectorAll('#stat-cards .stat-card')]
            .find(el => el.textContent.includes('영어'));
        expect(card.textContent).not.toContain('0.0');
        expect(card.querySelector('.text-3xl').textContent.trim()).toBe('-');
    });
});

describe('네 과목 모두 결시한 학생', () => {
    const data = () => [
        student('응시', 1, {
            korean: score('화법과 작문', 90), math: score('미적분', 80),
            inquiry1: score('물리학Ⅰ', 40), inquiry2: score('화학Ⅰ', 40),
        }),
        student('결시', 2), // 과목명은 있지만 점수가 전부 비었다
    ];

    it('점수 합 상위 명단에 넣지 않는다', () => {
        ST.data = data();
        document.getElementById('top-n-count').value = 'all';
        renderAll();
        const names = cellTexts('top20-tbody').map(r => r[3]);
        expect(names).toEqual(['응시']);
    });

    it('급간 분포에 0점으로 세지 않는다', () => {
        ST.data = data();
        renderAll();
        const {labels, datasets} = ST.charts.scoreDist.cfg.data;
        expect(datasets[0].data.reduce((a, b) => a + b, 0)).toBe(1);
        const zeroBin = datasets[0].data[labels.indexOf('0~9')];
        expect(zeroBin).toBe(0);
    });

    it('전교 석차 표에 넣지 않는다', () => {
        ST.data = data();
        document.getElementById('csat-top-n-count').value = 'all';
        renderAll();
        expect(cellTexts('csat-school-tbody').map(r => r[3])).toEqual(['응시']);
    });

    it('명단 모달의 점수 합은 0 이 아니라 - 이다', () => {
        ST.data = data();
        renderAll();
        showSelectedSubjectStudents('kor', '화법과 작문');
        const row = cellTexts('bin-modal-tbody').find(r => r[2] === '결시');
        expect(row[3]).toBe('-');
    });

    it('기준 점수가 아무에게도 없으면 이전 분포를 남기지 않는다', () => {
        // 대교협(가채점)은 표준점수가 없다. 표준점수 기준으로 바꾸면 모두가 0점 급간에 몰렸다.
        ST.data = [student('가', 1, {korean: {...score('화법과 작문', 90), std: null, pct: null}})];
        setGlobalBasis('raw');
        expect(ST.charts.scoreDist).toBeTruthy();
        setGlobalBasis('std');
        expect(ST.charts.scoreDist).toBeUndefined();
        expect(cellTexts('top20-tbody').flat().join('')).not.toContain('가');
        expect(document.getElementById('score-dist-tbody').textContent).not.toMatch(/\d+~\d+/);
        setGlobalBasis('raw');
    });
});

describe('동점자 순위', () => {
    // 합 250 이 아홉 명, 240 이 세 명. 10명을 고르면 10위 동점 세 명이 모두 들어가야 한다.
    const twelve = () => Array.from({length: 12}, (_, i) => student(`학생${i}`, i + 1, {
        korean: score('화법과 작문', i < 9 ? 90 : 80, 1), math: score('미적분', 80, 1),
        inquiry1: score('물리학Ⅰ', 40, 1), inquiry2: score('화학Ⅰ', 40, 1),
    }));

    it('상위 N명은 공동 순위(1,1,3)를 매기고 N번째 동점자를 모두 넣는다', () => {
        ST.data = twelve();
        document.getElementById('top-n-count').value = '10';
        renderAll();
        const ranks = cellTexts('top20-tbody').map(r => r[0]);
        expect(ranks).toEqual([...Array(9).fill('1'), '10', '10', '10']);
        expect(document.getElementById('top-n-title').innerText).toContain('동점');
    });

    it('동점자가 경계에 없으면 제목과 인원은 그대로다', () => {
        ST.data = twelve();
        document.getElementById('top-n-count').value = '10';
        ST.data[11].korean = score('화법과 작문', 70, 1);
        ST.data[10].korean = score('화법과 작문', 70, 1);
        renderAll();
        expect(cellTexts('top20-tbody')).toHaveLength(10);
        expect(document.getElementById('top-n-title').innerText).not.toContain('동점');
    });

    it('전교 석차는 세 기준이 모두 같을 때만 공동 순위다', () => {
        ST.data = twelve();
        // 원점수 합은 같지만 표준점수 합이 높은 학생은 단독 1위다
        ST.data[5].korean = {...score('화법과 작문', 90, 1), std: 999};
        document.getElementById('csat-top-n-count').value = '10';
        renderAll();
        const rows = cellTexts('csat-school-tbody');
        expect(rows.map(r => r[0])).toEqual(['1', ...Array(8).fill('2'), '10', '10', '10']);
        expect(rows[0][3]).toBe('학생5');
    });
});

describe('선택과목 평균 원점수', () => {
    // 유니브·김영일 양식은 원점수 열이 따로 있다. 공통·선택 칸 하나가 비어도 원점수는 있다.
    it('공통+선택을 다시 더하지 않고 원점수를 쓴다', () => {
        ST.data = [
            student('가', 1, {korean: {...score('화법과 작문', 85), common_raw: 60, select_raw: null}}),
            student('나', 2, {korean: {...score('화법과 작문', 75), common_raw: 50, select_raw: 25}}),
        ];
        renderAll();
        const row = cellTexts('kor-select-stats').find(r => r[0] === '화법과 작문');
        expect(row[2]).toBe('80.0');
    });
});
