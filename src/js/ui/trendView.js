import Chart from 'chart.js/auto';
import {linkStudents} from '../exams/identity.js';
import {ST} from '../main.js';
import {globalReportBasis, includeNoInquiry, labelMap} from '../report.js';
import {personTrend, schoolTrend} from '../trend/trend.js';
import {DASH, toFixedHalfUp} from '../utils.js';
import {showStudentRecord} from '../report/report-modal.js';
import {clear, el} from './dom.js';

/* ───────────────────────────────────────────
   § 통계 화면
   전교 통계: 회차마다 과목 평균과 합산(국어+수학+탐구평균) 평균.
   학생별 통계: 한 학생을 선택해 회차마다 점수와 합산 석차. 회차 사이 동일인은 exams/identity.js 가 잇는다.
   가로축은 회차 순서(상단에서 바꾼 순서)다. 값이 없는 회차는 선이 끊기고 표는 — 이다.
─────────────────────────────────────────── */

const fmt = (v, d = 1) => (Number.isFinite(v) ? toFixedHalfUp(v, d) : DASH);
/* 선택한 학생. linkStudents 의 결과는 그릴 때마다 새로 만들어지고, 회차 이름·순서가 바뀌면 키도 바뀐다.
 * 그래서 사람이 아니라 그 사람의 학생 레코드(객체)들을 기억해 두고, 다시 그릴 때 그 레코드를 가진 사람을 찾는다 */
let chosenRecords = null;

const recordsOf = (p, exams) => new Set(exams.flatMap(e => (p.entries[e.key] === undefined ? [] : [e.students[p.entries[e.key]]])));
const choose = (p, exams) => { chosenRecords = p ? recordsOf(p, exams) : null; };

/* reverse: 작을수록 좋은 값(등급·석차)은 축을 뒤집어 좋은 쪽을 위에 둔다 */
function drawLine(key, canvas, labels, datasets, {reverse = false, legend = true, tooltipLabel, min} = {}) {
    ST.charts[key]?.destroy();
    ST.charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {labels, datasets: datasets.map(d => ({spanGaps: false, tension: 0.2, pointRadius: 4, ...d}))},
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: {mode: 'index', intersect: false},
            plugins: {
                legend: {display: legend, position: 'bottom'},
                tooltip: tooltipLabel ? {callbacks: {label: tooltipLabel}} : {},
            },
            scales: {
                // 회차가 하나면 점이 왼쪽 끝에 붙지 않게 가운데에 찍는다
                x: {offset: labels.length === 1},
                y: {beginAtZero: false, reverse, ...(min === undefined ? {} : {min}), ...(reverse ? {ticks: {precision: 0}} : {})},
            },
        },
    });
}

const COLORS = ['#3a5a8c', '#c2410c', '#15803d', '#7c3aed', '#64748b'];

export function renderTrend() {
    const root = document.getElementById('trend-content');
    if (!root) return;
    clear(root);
    const exams = ST.exams;
    // 빈 화면은 보고서·내보내기와 같은 꼴(index.html 의 trend-empty)을 켠다
    document.getElementById('trend-empty')?.classList.toggle('hidden', exams.length > 0);
    if (!exams.length) return;
    const basis = globalReportBasis;
    const options = {includeNoInquiry: includeNoInquiry()};
    const label = labelMap[basis];
    const school = schoolTrend(exams, basis, options);
    const keys = school.map(s => s.key);

    root.append(el('p', {class: 'text-base text-ink-soft', text: `기준: ${label} · 합산: 국어+수학+탐구평균 · 회차는 상단 회차 목록의 순서를 따릅니다.`}));

    // ── 전교 통계 ──
    const schoolCanvas = el('canvas', {attrs: {id: 'trend-school-chart'}});
    const th = (t) => el('th', {class: 'border-b border-line px-3 py-2 text-left font-semibold text-ink-soft', text: t});
    const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-3 py-2 tabular-nums ${cls}`, text: t});
    root.append(el('section', {class: 'card px-5 py-4', attrs: {id: 'trend-school'}}, [
        el('h3', {class: 'text-xl font-bold', text: '전교 통계'}),
        el('div', {class: 'relative mt-3 h-72'}, [schoolCanvas]),
        el('div', {class: 'mt-4 overflow-x-auto'}, [el('table', {class: 'w-full text-base'}, [
            el('thead', {}, [el('tr', {}, [th('회차'), th('인원'), th('합산 대상'), th(`합산 평균`), th('국어'), th('수학'), th('탐구평균'), th('영어 등급')])]),
            el('tbody', {}, school.map(s => el('tr', {}, [
                td(s.key, 'font-semibold'), td(String(s.students)), td(String(s.ranked)),
                td(fmt(s.total)), td(fmt(s.kor)), td(fmt(s.math)), td(fmt(s.inq)), td(fmt(s.engGrade, 2)),
            ]))),
        ])]),
        school.some(s => s.kor === null && s.math === null)
            ? el('p', {class: 'mt-2 text-base text-wait', text: `${label}가 없는 회차는 표에 —로 표시하고 그래프에서 비워 둡니다.`})
            : null,
    ]));
    drawLine('trendSchool', schoolCanvas, keys, [
        {label: '합산 평균', data: school.map(s => s.total), borderColor: COLORS[0], backgroundColor: COLORS[0]},
        {label: '국어', data: school.map(s => s.kor), borderColor: COLORS[1], backgroundColor: COLORS[1]},
        {label: '수학', data: school.map(s => s.math), borderColor: COLORS[2], backgroundColor: COLORS[2]},
        {label: '탐구평균', data: school.map(s => s.inq), borderColor: COLORS[3], backgroundColor: COLORS[3]},
    ]);

    // ── 학생별 통계 ──
    const {persons, conflicts} = linkStudents(exams);
    const chosen = chosenRecords ? persons.find(p => [...recordsOf(p, exams)].some(r => chosenRecords.has(r))) ?? null : null;
    if (chosen) choose(chosen, exams);
    else chosenRecords = null;
    const search = el('input', {class: 'field', attrs: {type: 'search', placeholder: '이름·반·번호로 찾기', 'aria-label': '학생 찾기', autocomplete: 'off'}});
    const results = el('div', {class: 'mt-2 flex flex-wrap gap-2'});
    const detail = el('div', {class: 'mt-4'});
    const showResults = () => {
        clear(results);
        const q = search.value.trim().replace(/\s+/g, '');
        if (!q) return;
        const found = persons.filter(p => describe(p, exams).replace(/\s+/g, '').includes(q)).slice(0, 30);
        if (!found.length) results.append(el('span', {class: 'text-base text-ink-soft', text: '찾는 학생이 없습니다.'}));
        found.forEach(p => results.append(el('button', {
            class: `chip ${p === chosen ? 'ring-2 ring-brand' : ''}`, text: describe(p, exams), attrs: {type: 'button'},
            on: {click: () => { choose(p, exams); renderTrend(); }},
        })));
    };
    search.addEventListener('input', showResults);

    root.append(el('section', {class: 'card px-5 py-4', attrs: {id: 'trend-student'}}, [
        el('h3', {class: 'text-xl font-bold', text: '학생별 통계'}),
        el('p', {class: 'mt-1 text-base text-ink-soft', text: '학번 또는 학년·반·번호가 같은 학생을 같은 사람으로 봅니다. 이름이 다르면 연결하지 않습니다.'}),
        conflicts.length
            ? el('p', {class: 'mt-2 rounded-lg bg-wait-soft px-4 py-2 text-base text-wait', text: `회차 사이를 잇지 못한 기록이 ${new Set(conflicts.map(c => `${c.examKey}|${c.index}`)).size}건(회차별) 있습니다. 그 학생은 회차마다 따로 나옵니다.`})
            : null,
        el('div', {class: 'mt-3'}, [search]),
        results,
        detail,
    ]));

    if (chosen) renderPerson(detail, chosen, exams, basis, options, keys);
}


/** 학생을 가리키는 글: 이름 · 반-번호(또는 학번) · 몇 회차 */
function describe(p, exams) {
    const first = exams.find(e => p.entries[e.key] !== undefined);
    const s = first?.students[p.entries[first.key]];
    const who = s?.class && s?.number ? `${s.class}반 ${s.number}번` : s?.student_id ? s.student_id : '';
    return `${s?.name ?? ''}${who ? ` · ${who}` : ''} · ${Object.keys(p.entries).length}회`;
}

/* 학생별 영역 성적 차트에서 선택한 기준과 끈 과목. 학생을 바꾸거나 다시 그려도 유지한다 */
const SUBJECT_BASES = [['pct', '백분위'], ['grade', '등급'], ['raw', '원점수'], ['std', '표준점수']];
const SUBJECT_LINES = [['korean', '국어'], ['math', '수학'], ['inquiry1', '탐구1'], ['inquiry2', '탐구2']];
const SUBJECT_COLORS = {korean: '#0d9488', math: '#7c3aed', inquiry1: '#ea580c', inquiry2: '#0369a1'};
let subjectBasis = 'pct';
const hiddenSubjects = new Set();

/** 성적 표의 영역 줄. 영어·한국사는 절대평가라 원점수·등급만 있다 */
const TABLE_AREAS = [['korean', '국어'], ['math', '수학'], ['english', '영어'], ['inquiry1', '탐구1'], ['inquiry2', '탐구2'], ['hist', '한국사']];

/** 원점수: 원점수 열이 없으면 공통+선택(성적표와 같은 규칙) */
function rawOf(d) {
    if (!d) return null;
    if (Number.isFinite(d.raw)) return d.raw;
    if (Number.isFinite(d.common_raw) || Number.isFinite(d.select_raw)) return (d.common_raw || 0) + (d.select_raw || 0);
    return null;
}
const valueOf = (d, basis) => (basis === 'raw' ? rawOf(d) : (Number.isFinite(d?.[basis]) ? d[basis] : null));
const plain = (v) => (Number.isFinite(v) ? String(v) : DASH);

/** 줄을 누르면 그 회차의 이 학생 성적표를 연다 */
const openRecord = (r) => showStudentRecord(r.student, r.key);
const clickableRow = (r, cells) => el('tr', {
    class: 'cursor-pointer hover:bg-brand-soft', attrs: {tabindex: '0', title: `${r.key} 성적표 열기`},
    on: {click: () => openRecord(r), keydown: (e) => { if (e.key === 'Enter') openRecord(r); }},
}, cells);

function renderPerson(root, person, exams, basis, options, keys) {
    clear(root);
    const rows = personTrend(person, exams, basis, options);
    const th = (t, cls = '') => el('th', {class: `border-b border-line px-3 py-2 text-left font-semibold text-ink-soft ${cls}`, text: t});
    const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-3 py-2 tabular-nums ${cls}`, text: t});
    const absent = (r, span) => el('tr', {}, [td(r.key, 'font-semibold'), el('td', {class: 'border-b border-line-soft px-3 py-2 text-ink-soft', attrs: {colspan: String(span)}, text: '이 회차에는 없습니다'})]);

    // ── 회차별 영역 성적: 기준 칩과 과목 칩으로 선택한다 ──
    const subjectCanvas = el('canvas', {attrs: {id: 'trend-student-chart'}});
    const basisChips = el('div', {class: 'flex flex-wrap gap-2', attrs: {role: 'group', 'aria-label': '점수 기준'}});
    const subjectChips = el('div', {class: 'flex flex-wrap gap-2', attrs: {role: 'group', 'aria-label': '과목'}});
    const drawSubjects = () => {
        clear(basisChips);
        clear(subjectChips);
        SUBJECT_BASES.forEach(([b, text]) => basisChips.append(el('button', {
            class: `rounded-full border px-4 py-1 text-base font-semibold ${b === subjectBasis ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`,
            text, attrs: {type: 'button', 'aria-pressed': String(b === subjectBasis)},
            on: {click: () => { subjectBasis = b; drawSubjects(); }},
        })));
        SUBJECT_LINES.forEach(([k, text]) => {
            const on = !hiddenSubjects.has(k);
            subjectChips.append(el('button', {
                class: `inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 text-base font-medium ${on ? 'text-ink' : 'text-ink-soft'}`,
                attrs: {type: 'button', 'aria-pressed': String(on)},
                on: {click: () => { if (on) hiddenSubjects.add(k); else hiddenSubjects.delete(k); drawSubjects(); }},
            }, [el('span', {class: 'inline-block size-3 rounded-full', style: {background: on ? SUBJECT_COLORS[k] : '#9ca3af'}}), el('span', {text})]));
        });
        const basisLabel = SUBJECT_BASES.find(([b]) => b === subjectBasis)[1];
        drawLine('trendStudent', subjectCanvas, keys,
            SUBJECT_LINES.filter(([k]) => !hiddenSubjects.has(k)).map(([k, text]) => ({
                label: text, data: rows.map(r => (r.student ? valueOf(r.student[k], subjectBasis) : null)),
                borderColor: SUBJECT_COLORS[k], backgroundColor: '#fff', pointBorderColor: SUBJECT_COLORS[k], pointBorderWidth: 2,
            })),
            {
                // 등급은 1등급이 가장 좋으니 위로 둔다
                reverse: subjectBasis === 'grade',
                legend: false,
                tooltipLabel: (ctx) => ` ${ctx.dataset.label} ${ctx.formattedValue} ${basisLabel}`,
            });
    };

    const subjectTable = el('table', {class: 'w-full text-base', attrs: {id: 'trend-subject-table'}}, [
        el('thead', {}, [el('tr', {}, [th('회차'), th('영역'), th('과목명'), th('원점수', 'text-right'), th('표준점수', 'text-right'), th('백분위', 'text-right'), th('등급', 'text-right')])]),
        el('tbody', {}, rows.flatMap(r => (r.student
            ? TABLE_AREAS.map(([k, text]) => {
                const d = r.student[k] ?? {};
                return clickableRow(r, [td(r.key, 'font-semibold'), td(text), td(d.subject || DASH),
                    td(plain(rawOf(d)), 'text-right'), td(plain(d.std), 'text-right'), td(plain(d.pct), 'text-right'), td(plain(d.grade), 'text-right')]);
            })
            : [absent(r, 6)]))),
    ]);

    // ── 합산 석차: 1등이 위로 가게 축을 뒤집는다 ──
    const rankCanvas = el('canvas', {attrs: {id: 'trend-rank-chart'}});

    root.append(
        el('p', {class: 'text-lg font-semibold', text: describe(person, exams)}),
        el('div', {class: 'mt-3 rounded-xl border border-line p-4'}, [
            el('div', {class: 'flex flex-wrap items-center justify-between gap-3'}, [
                el('h4', {class: 'text-lg font-bold', text: '회차별 영역 성적'}),
                basisChips,
            ]),
            el('div', {class: 'mt-3'}, [subjectChips]),
            el('div', {class: 'relative mt-3 h-72'}, [subjectCanvas]),
            el('div', {class: 'mt-4 overflow-x-auto'}, [subjectTable]),
        ]),
        el('div', {class: 'mt-4 rounded-xl border border-line p-4'}, [
            el('h4', {class: 'text-lg font-bold', text: `회차별 합산 석차 (${labelMap[basis]} 기준)`}),
            el('div', {class: 'relative mt-3 h-60'}, [rankCanvas]),
            el('div', {class: 'mt-4 overflow-x-auto'}, [el('table', {class: 'w-full text-base', attrs: {id: 'trend-rank-table'}}, [
                el('thead', {}, [el('tr', {}, [th('회차'), th('합산'), th('합산 석차'), th('국어'), th('수학'), th('탐구평균'), th('영어 등급')])]),
                el('tbody', {}, rows.map(r => (r.student ? clickableRow(r, [
                    td(r.key, 'font-semibold'), td(fmt(r.total)), td(r.rank ? `${r.rank} / ${r.of}` : DASH),
                    td(fmt(r.kor)), td(fmt(r.math)), td(fmt(r.inq)), td(fmt(r.engGrade, 0)),
                ]) : absent(r, 6)))),
            ])]),
        ]),
    );
    drawSubjects();
    drawLine('trendRank', rankCanvas, keys, [
        {label: '합산 석차', data: rows.map(r => r.rank ?? null), borderColor: COLORS[0], backgroundColor: COLORS[0]},
    ], {
        reverse: true,
        legend: false,
        min: 1,
        tooltipLabel: (ctx) => ` ${ctx.formattedValue}등 / ${rows[ctx.dataIndex].of}명`,
    });
}

/** 성적표 모달 등에서: 이 학생(지금 회차의 위치)의 통계를 연다 */
export function choosePersonAt(examKey, index) {
    const {persons} = linkStudents(ST.exams);
    choose(persons.find(p => p.entries[examKey] === index) ?? null, ST.exams);
}
