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
const modal = await import('../src/js/report/report-modal.js');
const {initActions} = await import('../src/js/actions.js');

// 선택 상자의 change 를 실제 위임 경로로 보낸다. document 에 한 번만 건다
initActions();

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

    // 머리글은 "학번 > 이름 순" 인데 번호로만 정렬해, 번호가 같거나 빈 학생은 파일 순서대로 나왔다
    it('번호가 같거나 비어 있으면 이름순이다', () => {
        ST.data = [student('하', '1', ''), student('가', '1', ''), student('다', '1', '2'), student('나', '1', '2')];
        renderAll();
        expect(classRowNames()).toEqual(['가', '하', '나', '다']);
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

describe('행을 눌러 여는 학생', () => {
    // 이름·반·번호로 학생을 찾았다. 김영일 양식은 반·번호가 비어 있어 이름이 같은
    // 학생이 둘이면 어느 행을 눌러도 앞 학생의 성적표가 열리고 인쇄되었다.
    const twins = () => {
        const a = {...student('김철수', '', '', 90), student_id: 'A'};
        const b = {...student('김철수', '', '', 10), student_id: 'B'};
        return [a, b];
    };
    const openFrom = (row) => {
        modal.handleRowClick(row);
        return modal._printStudent?.student_id;
    };

    it('상위 N명·전교 석차 행은 그 행의 학생을 연다', () => {
        ST.data = twins();
        document.getElementById('csat-top-n-count').value = 'all';
        renderAll();
        // 합이 낮은 B 는 두 표 모두 두 번째 행이다
        expect(openFrom(document.querySelectorAll('#top20-tbody tr')[1])).toBe('B');
        expect(openFrom(document.querySelectorAll('#csat-school-tbody tr')[1])).toBe('B');
    });

    it('학급 표 행은 정렬된 순서와 상관없이 그 행의 학생을 연다', () => {
        const [a, b] = twins();
        // 번호가 빈 두 학생이 앞으로 정렬되어 ST.data 순서와 행 순서가 다르다
        ST.data = [student('다', '1', '3'), {...a, class: '1'}, {...b, class: '1'}];
        renderAll();
        const rows = document.querySelectorAll('#csat-class-tbody tr');
        expect(openFrom(rows[0])).toBe('A');
        expect(openFrom(rows[1])).toBe('B');
        expect(rows[2].dataset.name).toBe('다');
    });

    it('구간 명단·수능 최저 명단 행도 그 행의 학생을 연다', () => {
        ST.data = twins();
        ST.data[1].korean = {...ST.data[1].korean, grade: 1};
        renderAll();
        modal.showSelectedSubjectStudents('kor', '화법과 작문');
        const binRows = [...document.querySelectorAll('#bin-modal-tbody tr')];
        expect(binRows.map(openFrom)).toEqual(['A', 'B']);
        // 2합: A 는 1+2=3, B 는 1+1=2. 2 이내는 B 만 들어간다
        modal.showCsatStudents(2, 2);
        expect(openFrom(document.querySelector('#csat-list-modal-tbody tr'))).toBe('B');
    });
});

describe('표시 인원 선택', () => {
    // 표시 인원만 바꿔도 renderAll 이 돌아 캐시를 다시 만들고 차트를 모두 새로 그렸다.
    const change = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('change', {bubbles: true}));
    };
    const many = () => Array.from({length: 30}, (_, i) => student(`학생${i}`, '1', String(i + 1), i));

    it('상위 N명 표시 인원은 그 표만 다시 그린다', () => {
        ST.data = many();
        renderAll();
        charts.created = 0;
        change('top-n-count', '10');
        expect(charts.created).toBe(0);
        expect(document.querySelectorAll('#top20-tbody tr')).toHaveLength(10);
        expect(document.getElementById('top-n-title').innerText).toContain('상위 10명');
    });

    it('전교 석차 표시 인원은 그 표만 다시 그린다', () => {
        ST.data = many();
        renderAll();
        charts.created = 0;
        change('csat-top-n-count', '10');
        expect(charts.created).toBe(0);
        expect(document.querySelectorAll('#csat-school-tbody tr')).toHaveLength(10);
        expect(document.querySelectorAll('#top20-tbody tr')).toHaveLength(20);
    });
});

describe('성적표의 원점수', () => {
    // 성적표와 인쇄본은 공통·선택 칸이 하나라도 있으면 원점수 열 대신 둘을 더했다.
    // 원점수 열이 따로 있는 양식에서 선택 칸이 비면 공통만 원점수로 보였다(통계는 원점수 열을 쓴다).
    const withParts = (common, select, raw) => {
        const s = student('가', '1', '1');
        s.korean = {...s.korean, common_raw: common, select_raw: select, raw};
        return s;
    };
    const printed = () => {
        let html = '';
        const open = vi.spyOn(window, 'open').mockImplementation(() => ({
            document: {
                write: (h) => {
                    html += h;
                },
                close: () => {
                }
            }
        }));
        modal.printStudentDetail();
        open.mockRestore();
        // 원점수 행의 국어 칸(한국사 다음)
        const row = new DOMParser().parseFromString(html, 'text/html')
            .querySelectorAll('table')[1].querySelectorAll('tbody tr')[1];
        return row.children[2].textContent.trim();
    };

    it('선택 칸이 비어도 원점수 열 값을 보여 준다', () => {
        ST.data = [withParts(60, null, 85)];
        modal.showStudentDetail('가', '1', '1');
        const korRow = document.querySelector('#modal-score-tbody tr');
        expect(korRow.children[2].textContent.trim()).toBe('85');
        expect(printed()).toBe('85');
    });

    it('공통·선택이 모두 있으면 인쇄본은 나눠 적고 합계는 원점수 열 값이다', () => {
        ST.data = [withParts(60, 20, 85)];
        modal.showStudentDetail('가', '1', '1');
        expect(document.querySelector('#modal-score-tbody tr').children[2].textContent.trim()).toBe('85');
        expect(printed()).toBe('공통 60 + 선택 20(합계 85)');
    });

    it('원점수 열 값이 없으면 예전처럼 공통·선택으로 낸다', () => {
        ST.data = [withParts(60, 20, null)];
        modal.showStudentDetail('가', '1', '1');
        expect(document.querySelector('#modal-score-tbody tr').children[2].textContent.trim()).toBe('80');
        expect(printed()).toBe('공통 60 + 선택 20(합계 80)');
    });
});
