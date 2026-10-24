// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {createFilters} from '../src/js/ui/grid/filters.js';
import {openColumns} from '../src/js/ui/grid/columns.js';
import {buildRegistry} from '../src/js/ui/grid/registry.js';

/* 학생 표에 맞춘 차이: 범위칸 눈금, 학번은 값 목록, 열 선택의 묶음 */
const fields = [
    {key: 'number', label: '번호·학번'},
    {key: 'kor', label: '국어', numeric: true, group: 'score'},
    {key: 'inqAvg', label: '탐구평균', numeric: true, group: 'score'},
];
const rows = Array.from({length: 30}, (_, i) => ({number: 10101 + i, kor: 50 + i, inqAvg: 40 + i / 2}));
const registry = buildRegistry(rows, fields);
const block = (key) => createFilters({read: () => ({rows, registry, filters: [], search: ''}), onChange: () => {}}).blockFor(key);

describe('깔때기 값 목록', () => {
    it('점수 열은 범위칸이고 정수 열은 눈금 1, .5 가 있는 열은 0.5 다', () => {
        expect(block('kor').querySelector('input[type="range"]').step).toBe('1');
        expect(block('inqAvg').querySelector('input[type="range"]').step).toBe('0.5');
    });

    it('학번은 값이 모두 숫자여도 값 목록(체크박스)이다', () => {
        const b = block('number');
        expect(b.querySelector('input[type="range"]')).toBeNull();
        expect(b.querySelectorAll('input[type="checkbox"]').length).toBe(30);
    });

    it('범위칸은 데이터 범위를 표와 같은 글자로 적는다', () => {
        expect(block('inqAvg').textContent).toContain('데이터 범위 40 ~ 54.5');
    });
});

describe('열 선택', () => {
    it('묶음(학생 정보·점수)으로 나눠 보인다', () => {
        HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
        const dialog = document.createElement('dialog');
        document.body.append(dialog);
        openColumns(dialog, {registry, columns: ['number', 'kor'], pinned: 1, onApply: () => {}});
        const heads = [...dialog.querySelectorAll('h4')].map(h => h.textContent);
        expect(heads).toEqual(['학생 정보', '점수']);
    });
});

describe('addValueFilter', async () => {
    const {addValueFilter} = await import('../src/js/ui/grid/filters.js');
    it('값을 더하고, 이미 있으면 null, 같은 열 in 둘은 하나로 합친다', () => {
        expect(addValueFilter([], 'class', '1')).toEqual([{key: 'class', op: 'in', values: ['1']}]);
        expect(addValueFilter([{key: 'class', op: 'in', values: ['1']}], 'class', '1')).toBeNull();
        expect(addValueFilter([{key: 'class', op: 'in', values: ['1']}, {key: 'class', op: 'in', values: ['1', '2']}], 'class', '3'))
            .toEqual([{key: 'class', op: 'in', values: ['1', '2', '3']}]);
    });
});
