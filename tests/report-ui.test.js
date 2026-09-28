import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

/* jsdom 에는 canvas 가 없어 Chart.js 가 그리지 못한다. 만든 횟수만 센다. */
const charts = vi.hoisted(() => ({created: 0}));
vi.mock('chart.js/auto', () => ({
    default: class {
        constructor(ctx, cfg) {
            this.cfg = cfg;
            charts.created++;
        }

        destroy() {
        }
    }
}));

const {ST} = await import('../src/js/main.js');
const {renderAll} = await import('../src/js/report.js');

/* 리포트 화면의 선택 상자·행 클릭이 상태를 제대로 이어 가는지 실제 마크업 위에서 본다. */

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    HTMLCanvasElement.prototype.getContext = () => ({});
    ST.charts = {};
    charts.created = 0;
});

const score = (subject, raw, grade = null) => ({
    subject, raw, std: raw === null ? null : raw + 50, pct: raw === null ? null : raw, grade,
    common_raw: null, select_raw: null,
});

const student = (name, cls, number, raw = 50) => ({
    name, class: cls, number, student_id: '',
    korean: score('화법과 작문', raw, 2),
    math: score('미적분', raw, 3),
    english: {raw: null, std: null, pct: null, grade: 2},
    inquiry1: score('물리학Ⅰ', 40, 1),
    inquiry2: score('화학Ⅰ', 30, 4),
    hist: {raw: null, std: null, pct: null, grade: 1},
    fl2: {subject: '', raw: null, std: null, pct: null, grade: null},
});

const classRowNames = () => [...document.querySelectorAll('#csat-class-tbody tr')].map(tr => tr.dataset.name);

describe('학급 기준 반 선택', () => {
    // renderAll 이 반 목록을 매번 새로 만들어, 표시 인원·기준을 바꾸거나 창 크기만
    // 바꿔도 고른 반이 첫 반으로 돌아갔다.
    it('다시 그려도 고른 반을 유지한다', () => {
        ST.data = [student('가', '1', '1'), student('나', '2', '1'), student('다', '3', '1')];
        renderAll();
        document.getElementById('class-select').value = '3';
        renderAll();
        expect(document.getElementById('class-select').value).toBe('3');
        expect(classRowNames()).toEqual(['다']);
    });

    it('고른 반이 새 데이터에 없으면 첫 반을 보여 준다', () => {
        ST.data = [student('가', '1', '1'), student('다', '3', '1')];
        renderAll();
        document.getElementById('class-select').value = '3';
        ST.data = [student('가', '1', '1'), student('나', '2', '1')];
        renderAll();
        expect(document.getElementById('class-select').value).toBe('1');
        expect(classRowNames()).toEqual(['가']);
    });
});

describe('반 정보가 없는 데이터', () => {
    // 반 열이 없는 양식(김영일)을 올리면 반 목록만 비고 학급 표는 그대로 남아,
    // 이전 파일 학생들이 계속 보였다.
    it('학급 표에 이전 데이터를 남기지 않는다', () => {
        ST.data = [student('이전1', '1', '1'), student('이전2', '1', '2')];
        renderAll();
        ST.data = [student('새1', '', ''), student('새2', '', '')];
        renderAll();
        expect(document.getElementById('class-select').options).toHaveLength(0);
        expect(classRowNames()).toEqual([undefined]);
        expect(document.getElementById('csat-class-tbody').textContent.trim()).toBe('반 정보가 없습니다.');
    });
});
