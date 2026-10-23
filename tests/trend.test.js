import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('chart.js/auto', () => ({
    default: class {
        constructor(ctx, cfg) {
            this.cfg = cfg;
        }

        destroy() {
        }
    }
}));

const {addExam} = await import('../src/js/exams/examStore.js');
const {examRanks, personTrend, schoolTrend} = await import('../src/js/trend/trend.js');
const main = await import('../src/js/main.js');
const view = await import('../src/js/ui/trendView.js');
const {setGlobalBasis} = await import('../src/js/report.js');
const {ST} = main;

const sc = (raw, std = null) => ({raw, std, pct: null, grade: null});
const st = (name, number, kor, math, inq1, inq2 = sc(null)) => ({
    name, grade_year: '3', class: '1', number: String(number), student_id: '',
    korean: kor, math, english: {grade: 2}, inquiry1: {subject: '물리학Ⅰ', ...inq1}, inquiry2: {subject: '화학Ⅰ', ...inq2},
});
const exams = () => [
    {key: '3', students: [st('가', 1, sc(80), sc(70), sc(40), sc(30)), st('나', 2, sc(90), sc(60), sc(45))]},
    {key: '사설', students: [st('나', 2, sc(95), sc(70), sc(40)), st('가', 1, sc(70), sc(70), sc(40))]},
    {key: '4', students: [st('가', 1, sc(85, 130), sc(75, 128), sc(40, 60))]},
].reduce((list, e) => addExam(list, {...e, formatId: null, fileName: '', fileHash: ''}), []);

describe('추이 계산', () => {
    it('전교 추이는 회차 순서대로, 합산은 국어+수학+탐구평균이다', () => {
        const t = schoolTrend(exams(), 'raw');
        expect(t.map(x => x.key)).toEqual(['3', '4', '사설']);
        // 3월: 가 80+70+35=185, 나 90+60+45=195
        expect(t[0].total).toBe(190);
        expect(t[0].inq).toBe((35 + 45) / 2);
    });

    it('기준 값이 없는 회차는 null 로 두고 0 으로 채우지 않는다', () => {
        const t = schoolTrend(exams(), 'std');
        expect(t.map(x => x.total)).toEqual([null, 130 + 128 + 60, null]);
    });

    it('회차 안 합산 석차는 공동순위 1,1,3', () => {
        const e = {students: [st('a', 1, sc(10), sc(10), sc(10)), st('b', 2, sc(10), sc(10), sc(10)), st('c', 3, sc(5), sc(10), sc(10))]};
        const {ranks, of} = examRanks(e, 'raw');
        expect([...ranks.entries()].sort()).toEqual([[0, 1], [1, 1], [2, 3]]);
        expect(of).toBe(3);
    });

    it('학생 추이는 회차마다 한 줄, 없는 회차도 빈 줄로 남는다', () => {
        const person = {name: '나', entries: {3: 1, 사설: 0}};
        const t = personTrend(person, exams(), 'raw');
        expect(t.map(r => [r.key, r.student ? r.total : null, r.rank ?? null])).toEqual([
            ['3', 195, 1], ['4', null, null], ['사설', 205, 1],
        ]);
    });
});

describe('추이 화면', () => {
    beforeEach(() => {
        document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
            .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
        HTMLCanvasElement.prototype.getContext = () => ({});
        ST.charts = {};
        ST.exams = exams();
        ST.activeExamKey = '3';
        setGlobalBasis('raw');
    });

    it('전교 추이 표와 그래프(빈 회차는 끊김)를 그린다', () => {
        view.renderTrend();
        const rows = [...document.querySelectorAll('#trend-school tbody tr')].map(tr => tr.children[0].textContent);
        expect(rows).toEqual(['3', '4', '사설']);
        const chart = ST.charts.trendSchool.cfg;
        expect(chart.data.labels).toEqual(['3', '4', '사설']);
        expect(chart.data.datasets[0].spanGaps).toBe(false);
    });

    it('학생을 찾아 고르면 그 학생의 회차별 성적과 석차를 보인다', () => {
        view.renderTrend();
        const search = document.querySelector('[aria-label="학생 찾기"]');
        search.value = '나';
        search.dispatchEvent(new Event('input'));
        const button = [...document.querySelectorAll('#trend-student button')].find(b => b.textContent.startsWith('나'));
        button.click();
        const cells = [...document.querySelectorAll('#trend-student tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
        expect(cells[0].slice(0, 3)).toEqual(['3', '195.0', '1 / 2']);
        expect(cells[1]).toEqual(['4', '이 회차에는 없습니다']);
    });

    it('성적표의 「회차별 추이」는 그 학생을 고른 채 추이 화면을 연다', () => {
        view.choosePersonAt('3', 0);
        main.switchTab('trend');
        view.renderTrend();
        expect(document.querySelector('#trend-student').textContent).toContain('가 · 1반 1번 · 3회');
        expect(document.getElementById('tab-trend').classList.contains('hidden')).toBe(false);
    });

    it('학생을 고른 뒤 회차 순서·이름을 바꿔도 그 학생이 남는다', async () => {
        const {moveExam, renameExam} = await import('../src/js/exams/examStore.js');
        view.choosePersonAt('3', 0);
        view.renderTrend();
        ST.exams = moveExam(renameExam(ST.exams, '3', '2026-03'), '사설', -1);
        view.renderTrend();
        expect(document.querySelector('#trend-student p.text-lg')?.textContent).toContain('가 · 1반 1번 · 3회');
    });
});
