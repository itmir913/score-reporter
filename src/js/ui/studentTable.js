import {compositeScore, inquiryAvg} from '../core/aggregate.js';
import {createTable} from './table.js';
import {clear, el} from './dom.js';
import {applyQuery, describeFilter} from './grid/query.js';
import {buildRegistry} from './grid/registry.js';
import {createFilters} from './grid/filters.js';
import {openColumns} from './grid/columns.js';

/* ───────────────────────────────────────────
   § 학생 표 (GridTable + GridTool)
   admission-outcomes 의 표와 도구줄(main.js 의 표 부분)을 그대로 옮겼다:
   쪽 넘김(한 쪽 500행)·열 이름 줄 검색·깔때기 값 목록·정렬/필터 칩·초기화 단추.
   다른 점:
   - 행을 누르면 그 학생의 성적표가 열린다(onOpen).
   - 화면 상태(열·너비·정렬·필터)는 메모리에만 둔다. 필터에는 이름 같은 학생 값이 들어가므로
     브라우저 저장소에 남기지 않는다(CLAUDE.md).
   - 기준(원·표·백)이 바뀌면 점수 열의 범위 필터는 해제한다. 척도가 달라 그대로 두면
     조용히 다른 학생을 거른다.
─────────────────────────────────────────── */

const BASIS_LABEL = {raw: '원점수', std: '표준점수', pct: '백분위'};

/** 한 쪽에 담는 행 수 */
export const PAGE = 500;
const 수 = new Intl.NumberFormat('ko-KR');

/** 열 정의. numeric 이면 오른쪽 정렬·빈 값 —, 깔때기에서 범위칸 */
export function studentFields(basis) {
    const b = BASIS_LABEL[basis];
    return [
        {key: 'class', label: '반'},
        {key: 'number', label: '번호·학번'},
        {key: 'name', label: '이름'},
        {key: 'total', label: `합산(${b})`, numeric: true, group: 'score'},
        {key: 'kor', label: `국어 ${b}`, numeric: true, group: 'score'},
        {key: 'math', label: `수학 ${b}`, numeric: true, group: 'score'},
        {key: 'eng', label: '영어 등급', numeric: true, group: 'score'},
        {key: 'inq1Subject', label: '탐구1'},
        {key: 'inq1', label: `탐구1 ${b}`, numeric: true, group: 'score'},
        {key: 'inq2Subject', label: '탐구2'},
        {key: 'inq2', label: `탐구2 ${b}`, numeric: true, group: 'score'},
        {key: 'inqAvg', label: `탐구평균 ${b}`, numeric: true, group: 'score'},
        {key: 'hist', label: '한국사 등급', numeric: true, group: 'score'},
    ];
}

/** 기준을 따라 척도가 바뀌는 점수 열. 기준이 바뀌면 이 열들의 범위 필터를 해제한다 */
const BASIS_KEYS = new Set(['total', 'kor', 'math', 'inq1', 'inq2', 'inqAvg']);

const num = (v) => (Number.isFinite(v) ? v : null);

/** 학생 레코드 → 표의 한 줄. `#index` 는 회차 안 위치(성적표 보기에 쓴다, 열·검색에는 나오지 않는다) */
export function studentRow(s, index, basis, {includeNoInquiry = false} = {}) {
    return {
        '#index': index,
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

/** 처음 상태. 고정 열 셋은 반·번호·이름이다 — 가로로 밀어도 누구 줄인지 보여야 한다 */
function emptyView(fields) {
    return {columns: fields.map(f => f.key), widths: {name: 120, class: 70, number: 110}, pinned: 3, sorts: [], filters: []};
}

/* ── 전역 리스너는 파일에서 한 번만 건다 ──
 * 보고서 화면이 새로 그려지면 표를 다시 붙이는데(report.js), 그때마다 document 에 리스너를
 * 더하면 바깥 클릭 한 번에 닫기가 여러 번 돈다. 지금 붙어 있는 표 하나만 받는다. */
let current = null;
let 팝오버안에서눌렀다 = false;
/** 팝오버 안을 누른 시각. 그 직후(값 선택으로 표가 짧아져 생기는) 스크롤만 무시한다 */
let 팝오버누른때 = 0;
document.addEventListener('pointerdown', (event) => {
    const pop = document.getElementById('grid-popover');
    팝오버안에서눌렀다 = Boolean(pop?.contains(/** @type {Node} */ (event.target)));
    if (팝오버안에서눌렀다) 팝오버누른때 = Date.now();
}, true);
// 깔때기 단추 자신은 스스로 토글하므로, 팝오버 밖 클릭이면 닫는다
document.addEventListener('click', () => {
    if (!current || 팝오버안에서눌렀다) return;
    current.closePopover();
});
globalThis.addEventListener?.('keydown', (event) => {
    if (event.key === 'Escape') current?.closePopover();
});
/* 페이지는 #app-main 이 세로로 민다. 밀면 깔때기 단추가 제자리를 떠나므로 닫는다.
 * 다만 팝오버 안에서 값을 고르면 표가 짧아져 브라우저가 스크롤을 끌어올린다 —
 * 그 스크롤로는 닫지 않는다(사람이 민 것이 아니다). */
document.addEventListener('scroll', (event) => {
    if (!current || Date.now() - 팝오버누른때 < 300) return;
    if (event.target?.id === 'app-main') current.closePopover();
}, {capture: true, passive: true});

/**
 * 표를 붙인다. 돌려준 render(students, basis, options) 를 부를 때마다 다시 그린다.
 * @param {{root: HTMLElement, onOpen: (index: number) => void}} options
 */
export function mountStudentTable({root, onOpen}) {
    const get = (name) => root.querySelector(`[data-grid="${name}"]`);
    const dom = {
        scroller: get('scroller'), chips: get('chips'), chipLabel: get('chip-label'), rowCount: get('row-count'),
        notice: get('notice'), page: get('page'), pages: get('pages'), pinCount: get('pin-count'),
        popover: document.getElementById('grid-popover'),
    };

    let rows = [];
    let registry = [];
    let fields = [];
    let view = null;
    let basis = null;
    let page = 0;
    let 마지막조건 = '';
    let 보는행 = [];
    let 열린열 = null;
    let 마지막가로 = 0;

    const table = createTable({
        scroller: dom.scroller,
        colgroup: get('cols'),
        headRow: get('head'),
        searchRow: get('search'),
        body: get('body'),
        empty: get('empty'),
        onPinnedChange: () => paintToolbar(),
        columnSearch: (key) => view.filters.find(f => f.key === key && f.op === 'contains')?.text ?? '',
        // 글자 검색은 칸에 그대로 보이지만, 값 목록으로 건 필터는 단추 말고 알릴 자리가 없다
        columnFiltered: (key) => view.filters.some(f => f.key === key && f.op !== 'contains'),
        onColumnFilter: (key, anchor) => 팝오버열기(key, anchor),
        onColumnSearch: (key, text) => {
            const rest = view.filters.filter(f => !(f.key === key && f.op === 'contains'));
            const next = String(text ?? '').trim() === '' ? rest : [...rest, {key, op: 'contains', text}];
            view = {...view, filters: next};
            refresh({keepScroll: true});
        },
        onRowOpen: (row) => onOpen?.(row['#index']),
        onStateChange: (next) => {
            view = {...view, sorts: next.sorts, widths: next.widths, pinned: next.pinned, columns: next.columns};
            refresh({keepScroll: true});
        },
    });

    const filters = createFilters({
        read: () => ({rows, registry, filters: view.filters, search: ''}),
        onChange: (next) => {
            view = {...view, filters: next};
            refresh();
        },
    });

    const label = (key) => registry.find(f => f.key === key)?.label ?? key;

    function updateView(patch) {
        view = {...view, ...patch};
        refresh({keepScroll: true});
    }

    // ── 칩줄 ──
    function paintChips() {
        clear(dom.chips);
        const 걸린것 = view.sorts.length + view.filters.length;
        dom.chipLabel.textContent = 걸린것 ? '조건' : '설명';
        if (걸린것 === 0) {
            dom.chips.append(el('span', {
                class: 'truncate text-ink-soft',
                text: '열 제목을 눌러 정렬 / 열을 드래그해 순서 변경 / 열 사이 선을 드래그해 너비 조절 / 행을 누르면 성적표',
            }));
            return;
        }
        view.sorts.forEach((sort, rank) => {
            dom.chips.append(el('button', {
                class: 'chip border-pass/30 bg-pass-soft text-pass',
                attrs: {type: 'button', 'aria-label': `${label(sort.key)} 정렬 해제`, title: `${label(sort.key)} 정렬 해제`},
                on: {click: () => updateView({sorts: view.sorts.filter(item => item.key !== sort.key)})},
            }, [
                el('span', {class: 'chip-rank', text: String(rank + 1)}),
                el('span', {text: `${label(sort.key)} ${sort.dir === 'asc' ? '▲' : '▼'}`}),
                el('span', {class: 'text-pass/70', attrs: {'aria-hidden': 'true'}, text: '✕'}),
            ]));
        });
        for (const filter of view.filters) {
            dom.chips.append(el('span', {
                class: 'chip',
                attrs: {'data-filter-key': filter.key, 'data-filter-op': filter.op, tabindex: '-1'},
            }, [
                el('span', {text: describeFilter(filter, label(filter.key))}),
                el('button', {
                    class: 'text-brand/70 hover:text-brand',
                    text: '✕',
                    attrs: {type: 'button', 'aria-label': `${label(filter.key)} 필터 해제`},
                    on: {click: () => { view = {...view, filters: view.filters.filter(item => item !== filter)}; refresh(); }},
                }),
            ]));
        }
    }

    // ── 도구줄 ── 쓸 수 없는 단추도 자리를 지킨다
    const disable = (name, off) => {
        const node = get(name);
        node.disabled = off;
        node.setAttribute('aria-disabled', String(off));
    };

    function 고정보이는수() {
        return table.drawnPinned() ?? Math.min(view.pinned, view.columns.length);
    }

    function paintToolbar() {
        if (!view) return;
        const 보이는고정 = 고정보이는수();
        dom.pinCount.textContent = String(보이는고정);
        disable('pin-less', 보이는고정 <= 0);
        disable('pin-more', 보이는고정 >= view.columns.length || !table.canPinMore());
        disable('reset-sorts', view.sorts.length === 0);
        disable('reset-filters', view.filters.length === 0);
        // 인쇄는 다음 단계(3c)에서 잇는다
        disable('print', true);
    }

    // ── 쪽 넘김 ──
    const 쪽수 = (count) => Math.max(1, Math.ceil(count / PAGE));

    function paintPager(count, ms) {
        const 끝 = 쪽수(count) - 1;
        dom.page.value = String(page + 1);
        dom.pages.textContent = `/ ${수.format(끝 + 1)}쪽`;
        get('first').disabled = page <= 0;
        get('prev').disabled = page <= 0;
        get('next').disabled = page >= 끝;
        get('last').disabled = page >= 끝;
        const 첫행 = count === 0 ? 0 : page * PAGE + 1;
        const 끝행 = Math.min(count, (page + 1) * PAGE);
        dom.rowCount.textContent = `${수.format(첫행)}–${수.format(끝행)} / ${수.format(count)}명 · ${ms.toFixed(1)}ms`;
    }

    function 쪽가기(next) {
        const target = Math.max(0, Math.min(next, 쪽수(보는행.length) - 1));
        if (target === page) { dom.page.value = String(page + 1); return; }
        page = target;
        // 쪽을 넘기면 표 맨 위부터 본다
        refresh();
    }

    get('first').addEventListener('click', () => 쪽가기(0));
    get('prev').addEventListener('click', () => 쪽가기(page - 1));
    get('next').addEventListener('click', () => 쪽가기(page + 1));
    get('last').addEventListener('click', () => 쪽가기(Infinity));
    /** 쪽 번호 칸은 1부터 센다. 숫자가 아니면 보던 쪽으로 되돌린다 */
    const 쪽번호적용 = () => {
        const n = Number(dom.page.value);
        if (Number.isFinite(n) && n >= 1) 쪽가기(Math.floor(n) - 1);
        else dom.page.value = String(page + 1);
    };
    dom.page.addEventListener('keydown', (event) => { if (event.key === 'Enter') 쪽번호적용(); });
    dom.page.addEventListener('blur', 쪽번호적용);

    get('reset-sorts').addEventListener('click', () => updateView({sorts: []}));
    /* 「+」와 「−」는 지금 보이는 수에서 움직인다. 천장이 5인데 셋만 들어가는 화면에서
     * 「−」가 천장을 4로 내리면 눌렀는데 아무 일도 안 일어난다 */
    const 고정조정 = (step) => updateView({pinned: Math.max(0, Math.min(view.columns.length, 고정보이는수() + step))});
    get('pin-less').addEventListener('click', () => 고정조정(-1));
    get('pin-more').addEventListener('click', () => 고정조정(1));
    // 열 구성·순서·너비를 한꺼번에 되돌린다. 하나씩 되돌리게 하면 아무도 안 쓴다
    get('reset-columns').addEventListener('click', () => {
        const base = emptyView(fields);
        updateView({columns: base.columns, widths: base.widths, pinned: base.pinned});
    });
    get('columns').addEventListener('click', () => {
        openColumns(document.getElementById('grid-columns'), {
            registry,
            columns: view.columns,
            pinned: view.pinned,
            onApply: ({columns, pinned}) => { view = {...view, columns, pinned}; refresh(); },
        });
    });
    get('reset-filters').addEventListener('click', () => updateView({filters: []}));

    // ── 열별 값 목록(깔때기) ──
    function closePopover() {
        if (열린열 === null) return;
        열린열 = null;
        dom.popover.classList.add('hidden');
        clear(dom.popover);
        table.markOpenFilter(null);
    }

    /** 내용만 다시 그린다. 자리는 그대로 둔다 — 값을 선택할 때마다 창이 뛰면 다음 값을 누를 수 없다 */
    function 팝오버그리기() {
        if (열린열 === null) return;
        const field = registry.find(item => item.key === 열린열);
        const body = filters.blockFor(열린열);
        clear(dom.popover).append(
            el('div', {class: 'flex min-h-9 items-center gap-2 border-b border-line px-2.5'}, [
                el('h3', {class: 'min-w-0 flex-1 truncate text-base font-semibold', text: field?.label ?? 열린열, attrs: {title: field?.label ?? 열린열}}),
                el('button', {class: 'btn btn-sm px-2', text: '닫기', attrs: {type: 'button'}, on: {click: closePopover}}),
            ]),
            el('div', {class: 'max-h-[calc(80vh-3rem)] overflow-y-auto p-2.5'}, [body].filter(Boolean)),
        );
    }

    function 팝오버열기(key, anchor) {
        if (열린열 === key) { closePopover(); return; }
        // 자리를 먼저 잰다. markOpenFilter 가 열 이름 줄을 다시 그리면 이 단추가 떨어져 자리가 0이 된다
        const box = anchor.getBoundingClientRect();
        current = api;
        열린열 = key;
        dom.popover.classList.remove('hidden');
        팝오버그리기();
        table.markOpenFilter(key);
        const 폭 = dom.popover.offsetWidth;
        const 높이 = dom.popover.offsetHeight;
        const left = Math.max(8, Math.min(box.left, globalThis.innerWidth - 폭 - 8));
        const 아래 = box.bottom + 4;
        const top = 아래 + 높이 > globalThis.innerHeight - 8 ? Math.max(8, box.top - 높이 - 4) : 아래;
        dom.popover.style.left = `${left}px`;
        dom.popover.style.top = `${top}px`;
    }

    // 표를 옆으로 밀면 단추가 제자리를 떠난다. 따라다니게 만들기보다 닫는 편이 솔직하다
    dom.scroller.addEventListener('scroll', () => {
        const 가로 = dom.scroller.scrollLeft;
        if (가로 === 마지막가로) return;
        마지막가로 = 가로;
        closePopover();
    }, {passive: true});

    // ── 다시 그리기 ──
    function viewForTable() {
        return {columns: view.columns, widths: view.widths, pinned: view.pinned, sorts: view.sorts};
    }

    function refresh({keepScroll = false} = {}) {
        const 시작 = globalThis.performance?.now() ?? Date.now();
        const visible = applyQuery(rows, {filters: view.filters, sorts: view.sorts});
        const 걸린시간 = (globalThis.performance?.now() ?? Date.now()) - 시작;

        // 조건이 바뀌면 첫 쪽으로 돌아간다. 너비·고정만 바꾼 것은 조건이 아니므로 보던 쪽을 지킨다
        const 조건 = JSON.stringify([view.filters, view.sorts]);
        if (조건 !== 마지막조건) { 마지막조건 = 조건; page = 0; }
        page = Math.max(0, Math.min(page, 쪽수(visible.length) - 1));
        보는행 = visible;
        const 이쪽 = visible.slice(page * PAGE, (page + 1) * PAGE);
        paintPager(visible.length, 걸린시간);

        paintToolbar();
        팝오버그리기();
        paintChips();
        // 무엇 때문에 0명인지 말해 준다. 「없습니다」만으로는 어디를 되돌려야 하는지 모른다
        get('empty').textContent = view.filters.length
            ? '걸려 있는 필터에 맞는 학생이 없습니다. 위 칩에서 필터를 하나씩 떼어 보세요.'
            : '표시할 학생이 없습니다.';

        if (keepScroll) {
            const top = dom.scroller.scrollTop;
            table.render({rows: 이쪽, registry, state: viewForTable()});
            dom.scroller.scrollTop = top;
        } else {
            table.render({rows: 이쪽, registry, state: viewForTable()});
        }
    }

    const api = {
        closePopover,
        render(students, nextBasis, options = {}) {
            current = api;
            fields = studentFields(nextBasis);
            rows = (students ?? []).map((s, i) => studentRow(s, i, nextBasis, options));
            registry = buildRegistry(rows, fields);
            view ??= emptyView(fields);
            const 같은자료 = api.students === students;
            api.students = students;

            // 기준이 바뀌면 점수 열의 범위 필터는 척도가 달라진다. 해제하고 알린다
            let 해제 = 0;
            if (basis !== null && basis !== nextBasis) {
                const kept = view.filters.filter(f => !(f.op === 'range' && BASIS_KEYS.has(f.key)));
                해제 = view.filters.length - kept.length;
                view = {...view, filters: kept};
            }
            dom.notice.textContent = 해제
                ? `기준이 바뀌어 점수 범위 필터 ${해제}개를 해제했습니다. 값 선택 필터는 그대로라, 새 기준에 그 값이 없으면 표가 빌 수 있습니다.`
                : '';
            basis = nextBasis;
            // 회차가 바뀌면 값 목록 안 검색어만 비운다. 필터·정렬은 지킨다
            if (!같은자료) filters.reset();

            // 없는 열은 걸러 낸다
            const keys = new Set(fields.map(f => f.key));
            view = {
                ...view,
                columns: view.columns.filter(k => keys.has(k)),
                sorts: view.sorts.filter(s => keys.has(s.key)),
                filters: view.filters.filter(f => keys.has(f.key)),
            };
            // 같은 자료를 다시 그릴 때(창 크기 변경 등)는 보던 자리를 지킨다
            refresh({keepScroll: 같은자료});
        },
        get view() { return view; },
        get page() { return page; },
    };
    current = api;
    return api;
}
