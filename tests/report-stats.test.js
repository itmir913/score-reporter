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
    it('등급이 하나도 없으면 영어 상위 20% 는 — 이다', () => {
        ST.data = [
            student('가', 1, {korean: score('화법과 작문', 90)}),
            student('나', 2, {korean: score('화법과 작문', 70)}),
        ];
        renderAll();
        const card = [...document.querySelectorAll('#stat-cards .stat-card')]
            .find(el => el.textContent.includes('영어'));
        expect(card.textContent).not.toContain('0.0');
        expect(card.querySelector('.text-3xl').textContent.trim()).toBe('—');
    });
});

describe('요약 카드: 총 응시 인원', () => {
    // 명단에만 있고 점수가 하나도 없는 학생까지 세어, 응시하지 않은 학생이 응시 인원에 들어갔다
    it('점수가 하나라도 있는 학생만 센다', () => {
        ST.data = [
            student('국어만', 1, {korean: score('화법과 작문', 90)}),
            student('영어등급만', 2, {engGrade: 3}),
            student('결시', 3),
        ];
        ST.data[2].hist = {raw: null, std: null, pct: null, grade: null};
        renderAll();
        const card = [...document.querySelectorAll('#stat-cards .stat-card')]
            .find(el => el.textContent.includes('총 응시 인원'));
        expect(card.querySelector('.text-3xl').textContent.trim()).toBe('2명');
    });

    it('한국사·제2외국어 점수만 있어도 응시자다', () => {
        ST.data = [student('한국사만', 1), student('제2외국어만', 2), student('결시', 3)];
        ST.data[0].hist = {raw: 40, std: null, pct: null, grade: 2};
        ST.data[1].fl2 = {subject: '일본어Ⅰ', raw: null, std: null, pct: null, grade: 0};
        renderAll();
        const card = [...document.querySelectorAll('#stat-cards .stat-card')]
            .find(el => el.textContent.includes('총 응시 인원'));
        expect(card.querySelector('.text-3xl').textContent.trim()).toBe('2명');
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
        const zeroBin = datasets[0].data[labels.indexOf('0 이상')];
        expect(zeroBin).toBe(0);
    });

    it('전교 석차 표에 넣지 않는다', () => {
        ST.data = data();
        document.getElementById('csat-top-n-count').value = 'all';
        renderAll();
        expect(cellTexts('csat-school-tbody').map(r => r[3])).toEqual(['응시']);
    });

    it('명단 모달의 점수 합은 0 이 아니라 — 이다', () => {
        ST.data = data();
        renderAll();
        showSelectedSubjectStudents('kor', '화법과 작문');
        const row = cellTexts('bin-modal-tbody').find(r => r[2] === '결시');
        expect(row[3]).toBe('—');
    });

    it('기준 점수가 아무에게도 없으면 이전 분포를 남기지 않는다', () => {
        // 대교협(가채점)은 표준점수가 없다. 표준점수 기준으로 바꾸면 모두가 0점 급간에 몰렸다.
        // 원점수 합이 있으려면 네 과목 원점수가 모두 있어야 한다 (한 과목만 있으면 합에서 빠진다)
        const noStd = (subject, raw) => ({...score(subject, raw), std: null, pct: null});
        ST.data = [student('가', 1, {
            korean: noStd('화법과 작문', 90), math: noStd('미적분', 80),
            inquiry1: noStd('물리학Ⅰ', 40), inquiry2: noStd('화학Ⅰ', 40),
        })];
        setGlobalBasis('raw');
        expect(ST.charts.scoreDist).toBeTruthy();
        setGlobalBasis('std');
        expect(ST.charts.scoreDist).toBeUndefined();
        const rows = document.querySelectorAll('#top20-tbody [data-action="row-click"]').length;
        const distText = document.getElementById('score-dist-tbody').textContent;
        setGlobalBasis('raw');
        expect(rows).toBe(0);
        expect(distText).not.toMatch(/\d+ 이상/);
    });
});

describe('탐구를 한 과목만 본 학생', () => {
    // 예전에는 네 과목이 모두 있어야 합을 내서 탐구 한 과목 응시자가 순위·분포에서 빠졌다.
    // 이제 합산은 국어 + 수학 + 탐구평균이라, 한 과목 응시자는 그 과목 값으로 같은 척도에 들어간다
    const data = () => [
        student('응시', 1, {
            korean: score('화법과 작문', 90), math: score('미적분', 80),
            inquiry1: score('물리학Ⅰ', 40), inquiry2: score('화학Ⅰ', 40),
        }),
        student('일부결시', 2, {
            korean: score('화법과 작문', 95), math: score('미적분', 90),
            inquiry1: score('물리학Ⅰ', 45),
        }),
    ];

    it('상위 명단에 탐구평균으로 넣는다', () => {
        ST.data = data();
        document.getElementById('top-n-count').value = 'all';
        renderAll();
        // 일부결시 95+90+45 = 230, 응시 90+80+(40+40)/2 = 210
        expect(cellTexts('top20-tbody').map(r => [r[3], r[4]])).toEqual([['일부결시', '230.0'], ['응시', '210.0']]);
    });

    it('급간 분포와 막대 명단에 넣는다', () => {
        ST.data = data();
        document.getElementById('interval-size').value = '10';
        renderAll();
        const chart = ST.charts.scoreDist.cfg;
        expect(chart.data.datasets[0].data.reduce((a, b) => a + b, 0)).toBe(2);
        chart.options.onClick.call({data: chart.data}, null, [{index: 0}]);
        expect(cellTexts('bin-modal-tbody').map(r => r[2])).toEqual(['일부결시']);
    });

    it('명단 모달의 점수 합도 탐구평균 합이다', () => {
        ST.data = data();
        renderAll();
        showSelectedSubjectStudents('kor', '화법과 작문');
        const row = cellTexts('bin-modal-tbody').find(r => r[2] === '일부결시');
        expect(row[3]).toBe('230.0');
    });

    it('전교 석차 표도 탐구평균 합으로 매긴다', () => {
        ST.data = data();
        document.getElementById('csat-top-n-count').value = 'all';
        renderAll();
        // 일부결시 230 > 응시 210. 예전에는 탐구를 더해 응시(250)가 앞섰다
        expect(cellTexts('csat-school-tbody').map(r => r[3])).toEqual(['일부결시', '응시']);
    });
});

describe('탐구를 하나도 보지 않은 학생', () => {
    const data = () => [
        student('응시', 1, {
            korean: score('화법과 작문', 90), math: score('미적분', 80),
            inquiry1: score('물리학Ⅰ', 40), inquiry2: score('화학Ⅰ', 40),
        }),
        student('탐구없음', 2, {korean: score('화법과 작문', 95), math: score('미적분', 90)}),
        student('국어결시', 3, {math: score('미적분', 90), inquiry1: score('물리학Ⅰ', 45)}),
    ];

    it('기본은 합산에서 제외하고 제외한 인원을 밝힌다', () => {
        ST.data = data();
        document.getElementById('top-n-count').value = 'all';
        renderAll();
        expect(cellTexts('top20-tbody').map(r => r[3])).toEqual(['응시']);
        expect(document.getElementById('top-n-note').textContent).toBe('탐구 미응시 1명은 합산에서 제외했습니다.');
        expect(document.getElementById('dist-note').textContent).toBe('탐구 미응시 1명은 합산에서 제외했습니다.');
    });

    it('「탐구 미응시 학생도 포함」을 켜면 국어 + 수학으로 넣는다', () => {
        ST.data = data();
        document.getElementById('top-n-count').value = 'all';
        document.getElementById('include-no-inquiry').checked = true;
        renderAll();
        // 탐구없음 95+90 = 185 (탐구를 0점으로 보지 않는다), 국어결시는 여전히 뺀다
        expect(cellTexts('top20-tbody').map(r => [r[3], r[4]])).toEqual([['응시', '210.0'], ['탐구없음', '185.0']]);
        expect(document.getElementById('top-n-note').textContent).toContain('탐구 미응시 1명 포함');
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

describe('선택과목 원그래프 색', () => {
    const inquiries = (n) => Array.from({length: n}, (_, i) => student(`학생${i}`, i + 1, {
        // 인원이 서로 달라야 정렬 순서가 정해진다: 과목 i 를 i+1 명이 고르게 한다
        inquiry1: score(`탐구${i}`, 40), inquiry2: score('', null),
    })).flatMap((s, i) => Array.from({length: i + 1}, () => s));

    // 팔레트가 10색이라 11번째 과목부터 색이 비어 Chart.js 기본 회색이 칠해졌다
    it('과목이 13개여도 모두 서로 다른 색이다', () => {
        ST.data = inquiries(13);
        renderAll();
        const colors = ST.charts.inqSelectPie.cfg.data.datasets[0].backgroundColor;
        expect(colors).toHaveLength(13);
        expect(colors.every(c => typeof c === 'string')).toBe(true);
        expect(new Set(colors).size).toBe(13);
    });

    it('팔레트보다 과목이 많으면 색을 다시 쓴다', () => {
        ST.data = inquiries(25);
        renderAll();
        const colors = ST.charts.inqSelectPie.cfg.data.datasets[0].backgroundColor;
        expect(colors).toHaveLength(25);
        expect(colors.every(c => typeof c === 'string')).toBe(true);
    });
});

describe('소수 합의 2진 오차', () => {
    // 백분위 0.1+0.2 는 0.30000000000000004 라 0.3 인 학생과 다른 순위를 받았다
    // 한 과목이라도 비면 합에서 빠지므로 탐구 두 과목은 백분위 0 으로 채운다
    const pctOnly = (name, number, kor, math) => student(name, number, {
        korean: {...score('화법과 작문', 90), pct: kor},
        math: {...score('미적분', 80), pct: math},
        inquiry1: {...score('물리학Ⅰ', 40), pct: 0},
        inquiry2: {...score('화학Ⅰ', 40), pct: 0},
    });

    it('상위 N명: 화면에 같은 합이면 같은 순위다', () => {
        ST.data = [pctOnly('가', 1, 0.1, 0.2), pctOnly('나', 2, 0.3, 0), pctOnly('다', 3, 0.2, 0.1)];
        document.getElementById('top-n-count').value = 'all';
        setGlobalBasis('pct');
        const rows = cellTexts('top20-tbody');
        setGlobalBasis('raw');
        expect(rows.map(r => r[0])).toEqual(['1', '1', '1']);
        // 동점이면 반·번호 순이다
        expect(rows.map(r => r[3])).toEqual(['가', '나', '다']);
    });

    it('전교 석차: 백분위 합의 오차로 순위가 나뉘지 않는다', () => {
        ST.data = [pctOnly('나', 2, 0.3, 0), pctOnly('가', 1, 0.1, 0.2)];
        document.getElementById('csat-top-n-count').value = 'all';
        renderAll();
        expect(cellTexts('csat-school-tbody').map(r => r[0])).toEqual(['1', '1']);
    });

    it('급간 분포: 화면에 50.0 인 합은 50 이상 급간에 센다', () => {
        // 3.8+33.3+12.9 는 49.99999999999999 라 상위 N명에는 50.0 인데 40~49 급간에 들어갔다
        const threePct = (name, number, a, b, c) => student(name, number, {
            korean: {...score('화법과 작문', 90), pct: a},
            math: {...score('미적분', 80), pct: b},
            inquiry1: {...score('물리학Ⅰ', 40), pct: c},
            // 탐구2 백분위가 비면 탐구평균은 탐구1 값이다
            inquiry2: {...score('화학Ⅰ', 40), pct: null},
        });
        ST.data = [threePct('가', 1, 3.8, 33.3, 12.9), threePct('나', 2, 20, 20, 10)];
        document.getElementById('interval-size').value = '10';
        setGlobalBasis('pct');
        const [labels, counts] = cellTexts('score-dist-tbody').map(r => r.slice(1).filter(Boolean));
        const chart = ST.charts['scoreDist'].cfg;
        chart.options.onClick.call({data: chart.data}, null, [{index: 0}]);
        const binNames = cellTexts('bin-modal-tbody').map(r => r[2]);
        setGlobalBasis('raw');
        expect(labels).toEqual(['50 이상', '40 이상', '30 이상', '20 이상', '10 이상', '0 이상']);
        expect(counts).toEqual(['2', '0', '0', '0', '0', '0']);
        expect(binNames).toEqual(['가', '나']);
    });

    it('빈 분포 안내는 기준 이름만 쓴다', () => {
        const noStd = (subject, raw) => ({...score(subject, raw), std: null, pct: null});
        ST.data = [student('가', 1, {
            korean: noStd('화법과 작문', 90), math: noStd('미적분', 80),
            inquiry1: noStd('물리학Ⅰ', 40), inquiry2: noStd('화학Ⅰ', 40),
        })];
        setGlobalBasis('std');
        const text = document.getElementById('score-dist-tbody').textContent.trim();
        setGlobalBasis('raw');
        expect(text).toBe('이 회차에는 표준점수가 없어 표시할 수 없습니다.');
    });
});

describe('선택한 기준의 값이 이 회차에 없을 때 (원점수만 있는 가채점 등)', () => {
    const rawOnly = (subject, raw) => ({...score(subject, raw), std: null, pct: null});
    const data = () => [1, 2, 3].map(i => student(`학생${i}`, i, {
        korean: rawOnly('화법과 작문', 80 + i), math: rawOnly('미적분', 70), inquiry1: rawOnly('물리학Ⅰ', 40),
    }));

    it.each([['std', '표준점수'], ['pct', '백분위']])('%s: 안내를 띄우고 숫자 자리를 — 로 두며 원점수로 대신하지 않는다', (basis, label) => {
        ST.data = data();
        document.getElementById('top-n-count').value = 'all';
        setGlobalBasis(basis);
        const message = `이 회차에는 ${label}가 없어 표시할 수 없습니다.`;
        const banner = document.getElementById('basis-missing-note').textContent;
        const top = document.getElementById('top20-tbody').textContent.trim();
        const dist = document.getElementById('score-dist-tbody').textContent.trim();
        const cards = [...document.querySelectorAll('#stat-cards .stat-card')]
            .filter(el => /국어|수학/.test(el.textContent)).map(el => el.querySelector('.text-3xl').textContent.trim());
        const kor = cellTexts('kor-select-stats').find(r => r[0] === '화법과 작문');
        setGlobalBasis('raw');
        expect(banner).toBe(message);
        expect(top).toBe(message);
        expect(dist).toBe(message);
        expect(cards).toEqual(['—', '—']);
        expect(kor[2]).toBe('—');
        // 원점수 합(191 등)이 어디에도 새지 않는다
        expect(top + dist + cards.join('')).not.toMatch(/\d{2,}/);
    });

    it('원점수 기준에서는 안내가 없다', () => {
        ST.data = data();
        setGlobalBasis('raw');
        expect(document.getElementById('basis-missing-note').textContent).toBe('');
    });

    it('과목 분포 차트의 기준 선택에도 같은 안내를 띄운다', () => {
        ST.data = data();
        document.getElementById('chart-basis').value = 'pct';
        renderAll();
        const text = document.getElementById('chart-grid').textContent;
        document.getElementById('chart-basis').value = 'grade';
        expect(text).toContain('이 회차에는 백분위가 없어 표시할 수 없습니다.');
    });
});
