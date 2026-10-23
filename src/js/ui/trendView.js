import Chart from 'chart.js/auto';
import {linkStudents} from '../exams/identity.js';
import {ST} from '../main.js';
import {globalReportBasis, includeNoInquiry, labelMap} from '../report.js';
import {personTrend, schoolTrend} from '../trend/trend.js';
import {DASH, toFixedHalfUp} from '../utils.js';
import {clear, el} from './dom.js';

/* ───────────────────────────────────────────
   § 통계 화면
   전교 통계: 회차마다 과목 평균과 합산(국어+수학+탐구평균) 평균.
   학생별 통계: 한 학생을 골라 회차마다 점수와 합산 석차. 회차 사이 동일인은 exams/identity.js 가 잇는다.
   가로축은 회차 순서(머리줄에서 바꾼 순서)다. 값이 없는 회차는 선이 끊기고 표는 — 이다.
─────────────────────────────────────────── */

const fmt = (v, d = 1) => (Number.isFinite(v) ? toFixedHalfUp(v, d) : DASH);
/* 고른 학생. linkStudents 의 결과는 그릴 때마다 새로 만들어지고, 회차 이름·순서가 바뀌면 키도 바뀐다.
 * 그래서 사람이 아니라 그 사람의 학생 레코드(객체)들을 기억해 두고, 다시 그릴 때 그 레코드를 가진 사람을 찾는다 */
let chosenRecords = null;

const recordsOf = (p, exams) => new Set(exams.flatMap(e => (p.entries[e.key] === undefined ? [] : [e.students[p.entries[e.key]]])));
const choose = (p, exams) => { chosenRecords = p ? recordsOf(p, exams) : null; };

function drawLine(key, canvas, labels, datasets) {
    ST.charts[key]?.destroy();
    ST.charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {labels, datasets: datasets.map(d => ({...d, spanGaps: false, tension: 0.2, pointRadius: 4}))},
        options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {position: 'bottom'}}, scales: {y: {beginAtZero: false}}},
    });
}

const COLORS = ['#3a5a8c', '#c2410c', '#15803d', '#7c3aed', '#64748b'];

export function renderTrend() {
    const root = document.getElementById('trend-content');
    if (!root) return;
    clear(root);
    const exams = ST.exams;
    if (!exams.length) {
        root.append(el('p', {class: 'card px-6 py-12 text-center text-lg text-ink-soft', text: '불러온 회차가 없습니다. 「파일 추가」에서 회차를 불러오세요.'}));
        return;
    }
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

function renderPerson(root, person, exams, basis, options, keys) {
    clear(root);
    const rows = personTrend(person, exams, basis, options);
    const canvas = el('canvas', {attrs: {id: 'trend-student-chart'}});
    const th = (t) => el('th', {class: 'border-b border-line px-3 py-2 text-left font-semibold text-ink-soft', text: t});
    const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-3 py-2 tabular-nums ${cls}`, text: t});
    root.append(
        el('p', {class: 'text-lg font-semibold', text: describe(person, exams)}),
        el('div', {class: 'relative mt-3 h-72'}, [canvas]),
        el('div', {class: 'mt-4 overflow-x-auto'}, [el('table', {class: 'w-full text-base'}, [
            el('thead', {}, [el('tr', {}, [th('회차'), th('합산'), th('합산 석차'), th('국어'), th('수학'), th('탐구평균'), th('영어 등급')])]),
            el('tbody', {}, rows.map(r => el('tr', {}, r.student ? [
                td(r.key, 'font-semibold'), td(fmt(r.total)), td(r.rank ? `${r.rank} / ${r.of}` : DASH),
                td(fmt(r.kor)), td(fmt(r.math)), td(fmt(r.inq)), td(fmt(r.engGrade, 0)),
            ] : [td(r.key, 'font-semibold'), el('td', {class: 'border-b border-line-soft px-3 py-2 text-ink-soft', attrs: {colspan: '6'}, text: '이 회차에는 없습니다'})]))),
        ])]),
    );
    drawLine('trendStudent', canvas, keys, [
        {label: '합산', data: rows.map(r => r.total ?? null), borderColor: COLORS[0], backgroundColor: COLORS[0]},
        {label: '국어', data: rows.map(r => r.kor ?? null), borderColor: COLORS[1], backgroundColor: COLORS[1]},
        {label: '수학', data: rows.map(r => r.math ?? null), borderColor: COLORS[2], backgroundColor: COLORS[2]},
        {label: '탐구평균', data: rows.map(r => r.inq ?? null), borderColor: COLORS[3], backgroundColor: COLORS[3]},
    ]);
}

/** 성적표 모달 등에서: 이 학생(지금 회차의 위치)의 통계를 연다 */
export function choosePersonAt(examKey, index) {
    const {persons} = linkStudents(ST.exams);
    choose(persons.find(p => p.entries[examKey] === index) ?? null, ST.exams);
}
