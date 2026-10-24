import {describe, expect, it} from 'vitest';
import {
    applyQuery, describeFilter, facetCounts, matchesFilter, searchHaystack, sortRows, toggleSort,
} from '../src/js/ui/grid/query.js';
import {buildRegistry, formatNumber, valueLabel} from '../src/js/ui/grid/registry.js';

/* admission-outcomes tests/analysis.test.js 의 필터·검색·정렬·문장 테스트를 학생 행으로 옮겼다(합격 결과 관련 제외). */

const rows = [
    {'#index': 0, class: '1', number: '10101', name: '가온', kor: 90, inq1Subject: '물리학Ⅰ'},
    {'#index': 1, class: '1', number: '10102', name: '나래', kor: null, inq1Subject: '화학Ⅰ'},
    {'#index': 2, class: '2', number: '10201', name: '가람', kor: 75.5, inq1Subject: '물리학Ⅰ'},
];

describe('필터', () => {
    it('선택한 값만 남긴다', () => {
        expect(applyQuery(rows, {filters: [{key: 'inq1Subject', op: 'in', values: ['물리학Ⅰ']}]})).toHaveLength(2);
    });

    it('아무것도 고르지 않으면 아무것도 거르지 않는다', () => {
        expect(applyQuery(rows, {filters: [{key: 'class', op: 'in', values: []}]})).toHaveLength(3);
    });

    it('여러 필터는 함께 좁힌다', () => {
        const kept = applyQuery(rows, {filters: [
            {key: 'inq1Subject', op: 'in', values: ['물리학Ⅰ']},
            {key: 'class', op: 'in', values: ['2']},
        ]});
        expect(kept.map(r => r.name)).toEqual(['가람']);
    });

    it('숫자 범위는 양 끝을 포함하고, 빈칸(결시)은 범위에 들지 않는다', () => {
        expect(matchesFilter({g: 2}, {key: 'g', op: 'range', min: 2, max: 3})).toBe(true);
        expect(matchesFilter({g: 3}, {key: 'g', op: 'range', min: 2, max: 3})).toBe(true);
        expect(matchesFilter({g: 3.1}, {key: 'g', op: 'range', min: 2, max: 3})).toBe(false);
        expect(matchesFilter({g: null}, {key: 'g', op: 'range', min: 0, max: 100})).toBe(false);
    });

    it('한쪽만 준 범위도 받는다', () => {
        expect(matchesFilter({g: 5}, {key: 'g', op: 'range', min: 3, max: null})).toBe(true);
        expect(matchesFilter({g: 5}, {key: 'g', op: 'range', min: null, max: 3})).toBe(false);
    });

    it('빈칸(결시)도 고를 값의 하나로 다룬다', () => {
        expect(applyQuery(rows, {filters: [{key: 'kor', op: 'in', values: [null]}]}).map(r => r.name)).toEqual(['나래']);
        expect(matchesFilter({a: ''}, {key: 'a', op: 'in', values: [null]})).toBe(true);
        expect(matchesFilter({a: 0}, {key: 'a', op: 'in', values: [null]})).toBe(false);
    });

    it('빈칸만·값 있는 것만 남길 수 있다', () => {
        expect(applyQuery(rows, {filters: [{key: 'kor', op: 'blank'}]}).map(r => r.name)).toEqual(['나래']);
        expect(applyQuery(rows, {filters: [{key: 'kor', op: 'filled'}]})).toHaveLength(2);
    });

    it('숫자와 글자로 적힌 같은 값을 같게 본다', () => {
        expect(matchesFilter({y: 1}, {key: 'y', op: 'in', values: ['1']})).toBe(true);
    });

    it('열 검색(contains)은 화면 글자로 찾는다', () => {
        expect(applyQuery(rows, {filters: [{key: 'kor', op: 'contains', text: '75.5'}]})).toHaveLength(1);
        expect(applyQuery(rows, {filters: [{key: 'name', op: 'contains', text: '가'}]})).toHaveLength(2);
    });
});

describe('검색', () => {
    it('여러 낱말은 모두 포함(AND)으로 좁힌다', () => {
        expect(applyQuery(rows, {search: '가 물리'})).toHaveLength(2);
        expect(applyQuery(rows, {search: '가온 화학'})).toHaveLength(0);
    });

    it('내부용 열(#)은 훑지 않는다', () => {
        expect(searchHaystack({name: '가온', '#index': 12345})).not.toContain('12345');
    });
});

describe('값 목록 건수', () => {
    it('그 열에 걸린 값 선택은 제외하고 센다', () => {
        const counts = facetCounts(rows, [{key: 'inq1Subject', op: 'in', values: ['화학Ⅰ']}], 'inq1Subject');
        expect(counts.get('물리학Ⅰ')).toBe(2);
        expect(counts.get('화학Ⅰ')).toBe(1);
    });

    it('같은 열의 글자 검색은 남겨 센다', () => {
        const counts = facetCounts(rows, [{key: 'name', op: 'contains', text: '가'}], 'name');
        expect([...counts.keys()].sort()).toEqual(['가람', '가온']);
    });
});

describe('정렬', () => {
    const sample = [{n: '다', v: 2}, {n: '가', v: 1}, {n: '나', v: null}, {n: '라', v: 1}];

    it('빈칸은 어느 방향이든 뒤로 간다', () => {
        expect(sortRows(sample, [{key: 'v', dir: 'asc'}]).at(-1).n).toBe('나');
        expect(sortRows(sample, [{key: 'v', dir: 'desc'}]).at(-1).n).toBe('나');
    });

    it('앞선 키가 같을 때만 다음 키를 보고, 같으면 원래 순서다', () => {
        expect(sortRows(sample, [{key: 'v', dir: 'asc'}, {key: 'n', dir: 'desc'}]).map(r => r.n)).toEqual(['라', '가', '다', '나']);
        expect(sortRows(sample, [{key: 'v', dir: 'asc'}]).slice(0, 2).map(r => r.n)).toEqual(['가', '라']);
    });

    it('입력 배열을 건드리지 않는다', () => {
        const original = [...sample];
        sortRows(sample, [{key: 'v', dir: 'asc'}]);
        expect(sample).toEqual(original);
    });
});

describe('헤더 클릭', () => {
    it('오름차순 → 내림차순 → 해제로 돌고, 그냥 누르면 쌓인다', () => {
        let sorts = toggleSort([], 'kor');
        expect(sorts).toEqual([{key: 'kor', dir: 'asc'}]);
        sorts = toggleSort(sorts, 'name');
        expect(sorts.map(s => s.key)).toEqual(['kor', 'name']);
        sorts = toggleSort(sorts, 'kor');
        expect(sorts[0]).toEqual({key: 'kor', dir: 'desc'});
        expect(toggleSort(sorts, 'kor').map(s => s.key)).toEqual(['name']);
    });

    it('Shift를 누른 채면 이 열만 남는다', () => {
        expect(toggleSort([{key: 'kor', dir: 'asc'}], 'name', true)).toEqual([{key: 'name', dir: 'asc'}]);
    });
});

describe('필터를 문장으로', () => {
    it('무엇이 걸려 있는지 알아보게 적는다', () => {
        expect(describeFilter({key: 'c', op: 'in', values: ['1']}, '반')).toBe('반: 1');
        expect(describeFilter({key: 'c', op: 'in', values: ['가', '나', '다', '라']}, '이름')).toBe('이름: 가, 나, 다 외 1');
        expect(describeFilter({key: 'k', op: 'range', min: 60, max: 90}, '국어')).toBe('국어 60 ~ 90');
        expect(describeFilter({key: 'k', op: 'range', min: 60, max: null}, '국어')).toBe('국어 60 이상');
        expect(describeFilter({key: 'k', op: 'in', values: [null]}, '국어')).toBe('국어: (빈칸)');
    });
});

describe('레지스트리', () => {
    const fields = [
        {key: 'class', label: '반'}, {key: 'number', label: '번호·학번'},
        {key: 'kor', label: '국어', numeric: true, group: 'score'},
    ];

    it('열은 정의에 있는 것만이고 #index 는 없다', () => {
        expect(buildRegistry(rows, fields).map(f => f.key)).toEqual(['class', 'number', 'kor']);
    });

    it('학번처럼 값이 모두 숫자여도 정의가 숫자 열이 아니면 범위칸 대상이 아니다', () => {
        const numRows = rows.map((r, i) => ({...r, number: 10101 + i}));
        const reg = buildRegistry(numRows, fields);
        expect(reg.find(f => f.key === 'number').numeric).toBe(false);
        expect(reg.find(f => f.key === 'kor')).toMatchObject({numeric: true, range: {min: 75.5, max: 90}, filled: 2, integer: false});
    });

    it('숫자는 표와 같은 글자로 적는다(소수 1자리)', () => {
        expect(formatNumber(80)).toBe('80');
        expect(formatNumber(80.25)).toBe('80.3');
        expect(valueLabel('k', null)).toBe('(빈칸)');
    });
});
