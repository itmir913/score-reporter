import {compositeScore, inquiryAvg} from '../core/aggregate.js';
import {createTable, toggleSort} from './table.js';

/* ───────────────────────────────────────────
   § 학생 표 (GridTable)
   지금 고른 회차의 학생을 한 줄씩 보인다. 점수 열은 지금 고른 기준(원·표·백)을 따른다.
   정렬·열 너비·고정·열마다 검색은 admission-outcomes 의 표와 같다.
─────────────────────────────────────────── */

const BASIS_LABEL = {raw: '원점수', std: '표준점수', pct: '백분위'};

/** 열 정의. numeric 이면 오른쪽 정렬·빈 값 — */
export function studentFields(basis) {
    const b = BASIS_LABEL[basis];
    return [
        {key: 'class', label: '반'},
        {key: 'number', label: '번호·학번'},
        {key: 'name', label: '이름'},
        {key: 'total', label: `합산(${b})`, numeric: true},
        {key: 'kor', label: `국어 ${b}`, numeric: true},
        {key: 'math', label: `수학 ${b}`, numeric: true},
        {key: 'eng', label: '영어 등급', numeric: true},
        {key: 'inq1Subject', label: '탐구1'},
        {key: 'inq1', label: `탐구1 ${b}`, numeric: true},
        {key: 'inq2Subject', label: '탐구2'},
        {key: 'inq2', label: `탐구2 ${b}`, numeric: true},
        {key: 'inqAvg', label: `탐구평균 ${b}`, numeric: true},
        {key: 'hist', label: '한국사 등급', numeric: true},
    ];
}

const num = (v) => (Number.isFinite(v) ? v : null);

/** 학생 레코드 → 표의 한 줄. index 는 회차 안 위치(상세 보기에 쓴다) */
export function studentRow(s, index, basis, {includeNoInquiry = false} = {}) {
    return {
        index,
        class: s.class ?? '',
        number: s.student_id || s.number || '',
        name: s.name ?? '',
        total: compositeScore(s, basis, {includeNoInquiry}),
        kor: num(s.korean?.[basis]),
        math: num(s.math?.[basis]),
        eng: num(s.english?.grade),
        inq1Subject: s.inquiry1?.subject ?? '',
        inq1: num(s.inquiry1?.[basis]),
        inq2Subject: s.inquiry2?.subject ?? '',
        inq2: num(s.inquiry2?.[basis]),
        inqAvg: inquiryAvg(s, basis),
        hist: num(s.hist?.grade),
    };
}

/** 비교: 빈 값은 방향과 상관없이 맨 뒤. 글자는 숫자를 알아보는 사전순 */
function compare(a, b, dir) {
    const blankA = a === null || a === '';
    const blankB = b === null || b === '';
    if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
    const d = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'ko', {numeric: true});
    return dir === 'desc' ? -d : d;
}

/** 열마다 검색(글자 포함)과 여러 단 정렬 */
export function queryRows(rows, {search = {}, sorts = []} = {}) {
    const terms = Object.entries(search).filter(([, q]) => String(q ?? '').trim() !== '');
    const filtered = rows.filter(row => terms.every(([key, q]) =>
        String(row[key] ?? '').toLowerCase().includes(String(q).trim().toLowerCase())));
    if (!sorts.length) return filtered;
    return [...filtered].sort((a, b) => {
        for (const {key, dir} of sorts) {
            const d = compare(a[key], b[key], dir);
            if (d) return d;
        }
        return 0;
    });
}

/**
 * 표를 붙인다. 돌려준 render(students, basis, options) 를 부를 때마다 다시 그린다.
 * @param {{root: HTMLElement, onOpen: (index: number) => void}} options
 */
export function mountStudentTable({root, onOpen}) {
    const get = (sel) => root.querySelector(sel);
    const search = {};
    let state = null;
    let source = [];
    let fields = [];

    const table = createTable({
        scroller: get('[data-grid="scroller"]'),
        colgroup: get('[data-grid="cols"]'),
        headRow: get('[data-grid="head"]'),
        searchRow: get('[data-grid="search"]'),
        body: get('[data-grid="body"]'),
        empty: get('[data-grid="empty"]'),
        onRowOpen: (row) => onOpen?.(row.index),
        onStateChange: () => paint(),
        onColumnSearch: (key, value) => {
            search[key] = value;
            paint();
        },
        columnSearch: (key) => search[key] ?? '',
    });

    function paint() {
        const rows = queryRows(source, {search, sorts: state.sorts});
        const count = get('[data-grid="count"]');
        if (count) count.textContent = `${rows.length}명`;
        table.render({rows, registry: fields, state});
    }

    return {
        render(students, basis, options = {}) {
            fields = studentFields(basis);
            source = (students ?? []).map((s, i) => studentRow(s, i, basis, options));
            // 열 구성·너비·정렬은 회차나 기준이 바뀌어도 지킨다
            state ??= {columns: fields.map(f => f.key), widths: {name: 120, class: 70, number: 110}, pinned: 3, sorts: []};
            paint();
        },
        sortBy(key) {
            state.sorts = toggleSort(state.sorts, key, true);
            paint();
        },
    };
}
