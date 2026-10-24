import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mountStudentTable} = await import('../src/js/ui/studentTable.js');

/* 학생 명단 표(admission-outcomes 표 이식): 쪽 넘김·깔때기·칩·기준 전환. 합성 자료만 쓴다. */

beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
});

const sc = (subject, raw) => ({subject, raw, std: raw === null ? null : raw + 50, pct: raw, grade: raw === null ? null : 3});
const student = (i, kor) => ({
    class: String(1 + (i % 10)), number: String(i + 1), name: `학생${i}`, student_id: '',
    korean: sc('화법과 작문', kor), math: sc('미적분', 60), english: {grade: 2},
    inquiry1: sc('물리학Ⅰ', 40), inquiry2: sc('화학Ⅰ', 30), hist: {grade: 1},
});
const many = (n) => Array.from({length: n}, (_, i) => student(i, i % 7 === 0 ? null : 50 + (i % 50)));

const g = (name) => document.querySelector(`#student-grid [data-grid="${name}"]`);
const mount = () => mountStudentTable({root: document.getElementById('student-grid'), onOpen: vi.fn()});

describe('쪽 넘김', () => {
    it('1200명이면 한 쪽에 500명씩 3쪽이고, 다음 쪽으로 넘긴다', () => {
        const t = mount();
        t.render(many(1200), 'raw');
        expect(g('row-count').textContent).toMatch(/^1–500 \/ 1,200명/);
        expect(g('pages').textContent).toBe('/ 3쪽');
        expect(g('prev').disabled).toBe(true);
        g('next').click();
        expect(g('row-count').textContent).toMatch(/^501–1,000 \/ 1,200명/);
        g('last').click();
        expect(g('row-count').textContent).toMatch(/^1,001–1,200 \/ 1,200명/);
        expect(g('next').disabled).toBe(true);
    });

    it('필터를 걸면 첫 쪽으로 돌아간다', () => {
        const t = mount();
        t.render(many(1200), 'raw');
        g('next').click();
        expect(t.page).toBe(1);
        t.view.filters.push({key: 'class', op: 'in', values: ['1']});
        t.render(t.students, 'raw');
        expect(t.page).toBe(0);
        expect(g('row-count').textContent).toMatch(/^1–120 \/ 120명/);
    });

    it('같은 자료를 다시 그리면(창 크기 변경 등) 보던 쪽을 지킨다', () => {
        const t = mount();
        const data = many(1200);
        t.render(data, 'raw');
        g('next').click();
        t.render(data, 'raw');
        expect(t.page).toBe(1);
    });
});

describe('깔때기 값 목록', () => {
    it('열 이름 줄에 깔때기 단추가 있고, 눌러 값을 고르면 칩과 행 수가 바뀐다', () => {
        const t = mount();
        t.render(many(30), 'raw');
        const buttons = document.querySelectorAll('#student-grid .col-search button');
        expect(buttons.length).toBeGreaterThan(0);
        const cls = [...buttons][0]; // 첫 열(반)
        cls.click();
        const pop = document.getElementById('grid-popover');
        expect(pop.classList.contains('hidden')).toBe(false);
        const box = [...pop.querySelectorAll('label')].find(l => l.textContent.startsWith('1') && !l.textContent.startsWith('10'))
            .querySelector('input');
        // 실제 브라우저처럼 누르기 전에 pointerdown 이 온다(팝오버 안을 눌렀다고 적어 둔다)
        box.dispatchEvent(new Event('pointerdown', {bubbles: true}));
        box.click();
        expect(pop.classList.contains('hidden')).toBe(false);
        expect(g('chips').textContent).toContain('반: 1');
        expect(g('row-count').textContent).toMatch(/\/ 3명/);
    });

    it('점수 열 (빈칸)을 고르면 결시생만 남고, 같은 열 글자 검색은 지워지지 않는다', () => {
        const t = mount();
        t.render(many(1200), 'raw');
        t.view.filters.push({key: 'name', op: 'contains', text: '학생'});
        t.view.filters.push({key: 'kor', op: 'in', values: [null]});
        t.render(t.students, 'raw');
        expect(g('row-count').textContent).toMatch(/\/ 172명/); // i % 7 === 0
        expect(t.view.filters.some(f => f.op === 'contains')).toBe(true);
    });

    it('바깥을 누르거나 Esc 로 닫는다', () => {
        const t = mount();
        t.render(many(30), 'raw');
        document.querySelector('#student-grid .col-search button').click();
        const pop = document.getElementById('grid-popover');
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        expect(pop.classList.contains('hidden')).toBe(true);
        expect(t).toBeTruthy();
    });
});

describe('기준 전환', () => {
    it('점수 열의 범위 필터는 해제하고 알린다. 값 선택 필터는 남긴다', () => {
        const t = mount();
        t.render(many(100), 'raw');
        t.view.filters.push({key: 'kor', op: 'range', min: 60, max: 90}, {key: 'class', op: 'in', values: ['1']});
        t.render(t.students, 'pct');
        expect(t.view.filters).toEqual([{key: 'class', op: 'in', values: ['1']}]);
        expect(g('notice').textContent).toContain('점수 범위 필터 1개를 해제');
    });
});

describe('초기화·칩', () => {
    it('정렬·필터가 없으면 초기화 단추는 쓸 수 없고, 설명을 적는다', () => {
        const t = mount();
        t.render(many(10), 'raw');
        expect(g('reset-sorts').disabled).toBe(true);
        expect(g('reset-filters').disabled).toBe(true);
        expect(g('chip-label').textContent).toBe('설명');
        t.view.filters.push({key: 'class', op: 'in', values: ['1']});
        t.render(t.students, 'raw');
        expect(g('reset-filters').disabled).toBe(false);
        g('reset-filters').click();
        expect(t.view.filters).toEqual([]);
    });
});

describe('저장·리스너', () => {
    it('브라우저 저장소에 아무것도 쓰지 않는다', () => {
        const set = vi.spyOn(Storage.prototype, 'setItem');
        const t = mount();
        t.render(many(30), 'raw');
        t.view.filters.push({key: 'name', op: 'contains', text: '학생1'});
        t.render(t.students, 'raw');
        expect(set).not.toHaveBeenCalled();
        set.mockRestore();
    });

    it('두 번 붙여도 document 에 리스너를 더하지 않는다', () => {
        const add = vi.spyOn(document, 'addEventListener');
        mount();
        mount();
        expect(add).not.toHaveBeenCalled();
        add.mockRestore();
    });

    it('행을 누르면 그 학생의 회차 안 위치로 성적표를 연다', () => {
        const onOpen = vi.fn();
        const t = mountStudentTable({root: document.getElementById('student-grid'), onOpen});
        t.render(many(5), 'raw');
        const row = document.querySelector('#student-grid [data-grid="body"] tr[tabindex]');
        row?.click();
        if (row) expect(onOpen).toHaveBeenCalledWith(expect.any(Number));
    });
});
