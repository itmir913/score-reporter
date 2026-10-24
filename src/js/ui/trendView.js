import Chart from 'chart.js/auto';
import {linkStudents} from '../exams/identity.js';
import {ST} from '../main.js';
import {includeNoInquiry} from '../report.js';
import {sortedExams} from '../exams/examStore.js';
import {personTrend, schoolTrend} from '../trend/trend.js';
import {AREAS, areaScore, changeText, changeVsPrev, CSAT_AREAS, csatTimeline, MERGED, rawOf, strengths} from '../trend/personal.js';
import {CSAT_INQUIRY_MODES, CSAT_SUBJECTS, csatSumsOf, getCsatSubjects} from '../report/report-csat-sum.js';
import {PCT_MAX, PCT_MIN, STRENGTH_SIMILAR} from '../core/limits.js';
import {DASH, fmt} from '../utils.js';
import {showStudentRecord} from '../report/report-modal.js';
import {clear, el} from './dom.js';

/* ───────────────────────────────────────────
   § 통계 화면
   전교 통계: 회차마다 과목 평균과 합산(국어+수학+탐구평균) 평균.
   학생별 통계: 한 학생을 선택해 회차마다 점수와 합산 석차. 회차 사이 동일인은 exams/identity.js 가 잇는다.
   가로축은 회차 순서(상단에서 바꾼 순서)다. 값이 없는 회차는 선이 끊기고 표는 — 이다.
─────────────────────────────────────────── */

/* 선택한 학생. linkStudents 의 결과는 그릴 때마다 새로 만들어지고, 회차 이름·순서가 바뀌면 키도 바뀐다.
 * 그래서 사람이 아니라 그 사람의 학생 레코드(객체)들을 기억해 두고, 다시 그릴 때 그 레코드를 가진 사람을 찾는다 */
let chosenRecords = null;

const recordsOf = (p, exams) => new Set(exams.flatMap(e => (p.entries[e.key] === undefined ? [] : [e.students[p.entries[e.key]]])));
const choose = (p, exams) => { chosenRecords = p ? recordsOf(p, exams) : null; };

/** 차트를 key 자리에 새로 그린다. 같은 자리의 이전 차트는 먼저 지운다 */
function drawChart(key, canvas, config) {
    ST.charts[key]?.destroy();
    ST.charts[key] = new Chart(canvas.getContext('2d'), config);
}

/* reverse: 작을수록 좋은 값(등급·석차)은 축을 뒤집어 좋은 쪽을 위에 둔다 */
function drawLine(key, canvas, labels, datasets, {reverse = false, legend = true, tooltipLabel, min, secondAxis = false} = {}) {
    drawChart(key, canvas, {
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
                ...(secondAxis ? {y1: {position: 'right', beginAtZero: false, grid: {drawOnChartArea: false}}} : {}),
            },
        },
    });
}

const COLORS = ['#3a5a8c', '#c2410c', '#15803d', '#7c3aed', '#64748b'];

/* 통계 화면의 점수 기준 칩. 차트마다 따로 선택하고, 다시 그려도 유지한다 */
const BASES = [['pct', '백분위'], ['grade', '등급'], ['raw', '원점수'], ['std', '표준점수']];
const basisLabelOf = (b) => BASES.find(([k]) => k === b)[1];
let schoolBasis = 'pct';
let rankBasis = 'pct';

/** 기준 칩 묶음. 누르면 onPick(기준)을 부른다 */
function basisChips(current, onPick, ariaLabel) {
    return el('div', {class: 'flex flex-wrap gap-2', attrs: {role: 'group', 'aria-label': ariaLabel}},
        BASES.map(([b, text]) => el('button', {
            class: `rounded-full border px-4 py-1 text-base font-semibold ${b === current ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`,
            text, attrs: {type: 'button', 'aria-pressed': String(b === current)},
            on: {click: () => onPick(b)},
        })));
}

/** 등급에는 탐구평균·합산을 쓰지 않는다(CLAUDE.md). 등급 기준이면 합산·탐구평균은 비운다 */
function schoolRows(exams, basis, options) {
    return schoolTrend(exams, basis, options).map(s => (basis === 'grade' ? {...s, total: null, inq: null, ranked: null} : s));
}

/* 학급 드롭다운에서 선택한 학급. 학생을 선택하면 그 학생의 학급으로 맞춘다 */
let chosenClass = null;

export function renderTrend() {
    const root = document.getElementById('trend-content');
    if (!root) return;
    clear(root);
    const exams = ST.exams;
    // 빈 화면은 보고서·내보내기와 같은 꼴(index.html 의 trend-empty)을 켠다
    document.getElementById('trend-empty')?.classList.toggle('hidden', exams.length > 0);
    if (!exams.length) return;
    const options = {includeNoInquiry: includeNoInquiry()};
    const keys = sortedExams(exams).map(e => e.key);

    // 칩·드롭다운은 바뀐 부분만 다시 그린다. 화면 전체를 다시 그리면 그 사이 높이가 줄어 스크롤이 위로 튄다
    const schoolSection = el('section', {class: 'card px-5 py-4', attrs: {id: 'trend-school'}});
    root.append(schoolSection);
    paintSchool(schoolSection, exams, options, keys);
    root.append(studentSection(exams, options, keys));
}

/** 전교 통계 칸을 (다시) 채운다. 기준 칩을 바꾸면 이 칸만 다시 그린다 */
function paintSchool(section, exams, options, keys) {
    const school = schoolRows(exams, schoolBasis, options);
    const label = basisLabelOf(schoolBasis);
    const isGrade = schoolBasis === 'grade';
    const schoolCanvas = el('canvas', {attrs: {id: 'trend-school-chart'}});
    const th = (t) => el('th', {class: 'border-b border-line bg-canvas px-2 py-2 text-left font-semibold text-ink-soft whitespace-nowrap', text: t});
    const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-2 py-2 tabular-nums whitespace-nowrap ${cls}`, text: t});
    const d = isGrade ? 2 : 1;
    section.replaceChildren(...[
        el('div', {class: 'flex flex-wrap items-center justify-between gap-3'}, [
            el('h3', {class: 'text-xl font-bold', text: '전교 통계'}),
            basisChips(schoolBasis, (b) => { schoolBasis = b; paintSchool(section, exams, options, keys); }, '전교 통계 기준'),
        ]),
        // 넓은 화면에서는 차트와 표를 나란히 둔다. 차트가 덜 납작해져 회차 사이 기울기가 잘 보인다
        // grid-cols-1·min-w-0: 한 열일 때 표·차트가 열을 넓혀 페이지가 옆으로 넘치지 않게 열 너비를 화면에 묶는다
        el('div', {class: 'mt-3 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start [&>*]:min-w-0'}, [
            el('div', {class: 'relative h-72'}, [schoolCanvas]),
            el('div', {}, [
            el('div', {class: 'overflow-x-auto rounded-lg border border-line'}, [el('table', {class: 'w-full text-base'}, [
                    el('thead', {}, [el('tr', {}, [th('회차'), th('인원'), ...(isGrade ? [] : [th('합산 대상'), th('합산 평균')]), th('국어'), th('수학'), ...(isGrade ? [] : [th('탐구평균')]), th('영어 등급')])]),
                    el('tbody', {}, school.map(s => el('tr', {class: 'hover:bg-brand-soft'}, [
                        td(s.key, 'font-semibold'), td(String(s.students)),
                        ...(isGrade ? [] : [td(String(s.ranked)), td(fmt(s.total))]),
                        td(fmt(s.kor, d)), td(fmt(s.math, d)), ...(isGrade ? [] : [td(fmt(s.inq))]), td(fmt(s.engGrade, 2)),
                    ]))),
                ])]),
                isGrade ? null : el('p', {class: 'mt-2 text-right text-base text-ink-soft', text: '합산: 국어+수학+탐구평균'}),
            ].filter(Boolean)),
        ]),
        isGrade ? el('p', {class: 'mt-2 text-base text-ink-soft', text: '등급은 합산과 탐구평균을 내지 않습니다. 과목별 평균 등급만 보입니다.'}) : null,
        school.some(s => s.kor === null && s.math === null)
            ? el('p', {class: 'mt-2 text-base text-wait', text: `${label}가 없는 회차는 표에 —로 표시하고 그래프에서 비워 둡니다.`})
            : null,
    ].filter(Boolean));
    drawLine('trendSchool', schoolCanvas, keys, [
        // 합산은 과목보다 몇 배 커서 같은 축에 두면 과목 선이 납작해진다. 오른쪽 축을 따로 쓴다
        ...(isGrade ? [] : [{label: '합산 평균 (오른쪽 축)', data: school.map(s => s.total), borderColor: COLORS[0], backgroundColor: COLORS[0], yAxisID: 'y1'}]),
        {label: '국어', data: school.map(s => s.kor), borderColor: COLORS[1], backgroundColor: COLORS[1]},
        {label: '수학', data: school.map(s => s.math), borderColor: COLORS[2], backgroundColor: COLORS[2]},
        ...(isGrade ? [] : [{label: '탐구평균', data: school.map(s => s.inq), borderColor: COLORS[3], backgroundColor: COLORS[3]}]),
    ], {reverse: isGrade, secondAxis: !isGrade});
}

/** 학생별 통계 칸: 학급 → 학생 드롭다운. 드롭다운을 바꾸면 학생 목록과 아래 상세만 다시 그린다 */
function studentSection(exams, options, keys) {
    const {persons, conflicts} = linkStudents(exams);
    const chosen = chosenRecords ? persons.find(p => [...recordsOf(p, exams)].some(r => chosenRecords.has(r))) ?? null : null;
    if (chosen) choose(chosen, exams);
    else chosenRecords = null;

    const groups = classGroups(persons, exams);
    if (chosen) chosenClass = groups.find(g => g.persons.includes(chosen))?.key ?? chosenClass;
    if (!groups.some(g => g.key === chosenClass)) chosenClass = null;
    const currentGroup = () => groups.find(g => g.key === chosenClass);

    const classSelect = el('select', {class: 'field', attrs: {'aria-label': '학급'}}, [
        el('option', {text: '학급 선택', attrs: {value: '', disabled: true, selected: !currentGroup()}}),
        ...groups.map(g => el('option', {text: `${g.label} (${g.persons.length}명)`, attrs: {value: g.key, selected: g.key === chosenClass}})),
    ]);
    const studentSelect = el('select', {class: 'field', attrs: {'aria-label': '학생'}});
    const detail = el('div', {class: 'mt-4'});
    const fillStudents = (picked) => {
        const group = currentGroup();
        studentSelect.disabled = !group;
        studentSelect.replaceChildren(
            el('option', {text: group ? '학생 선택' : '학급을 먼저 선택하세요', attrs: {value: '', disabled: true, selected: !picked}}),
            ...(group?.persons ?? []).map((p, i) => el('option', {text: studentLabel(p, exams), attrs: {value: String(i), selected: p === picked}})),
        );
    };
    // 학급을 바꾸면 그 학급의 첫 학생을 바로 보인다. 상세를 비우면 페이지가 짧아져 스크롤이 위로 밀린다
    classSelect.addEventListener('change', () => {
        chosenClass = classSelect.value;
        const first = currentGroup()?.persons[0] ?? null;
        choose(first, exams);
        fillStudents(first);
        if (first) renderPerson(detail, first, exams, options, keys);
        else clear(detail);
    });
    studentSelect.addEventListener('change', () => {
        const p = currentGroup().persons[Number(studentSelect.value)];
        choose(p, exams);
        renderPerson(detail, p, exams, options, keys);
    });
    fillStudents(chosen);
    if (chosen) renderPerson(detail, chosen, exams, options, keys);

    const field = (text, control) => el('label', {class: 'flex min-w-0 flex-col gap-1'}, [el('span', {class: 'text-base text-ink-soft', text}), control]);
    return el('section', {class: 'card px-5 py-4', attrs: {id: 'trend-student'}}, [
        el('h3', {class: 'text-xl font-bold', text: '학생별 통계'}),
        el('p', {class: 'mt-1 text-base text-ink-soft', text: '학번 또는 학년·반·번호가 같으면 이름이 달라도 같은 학생으로 봅니다.'}),
        conflicts.length
            ? el('p', {class: 'mt-2 rounded-lg bg-wait-soft px-4 py-2 text-base text-wait', text: `회차 사이를 잇지 못한 기록이 ${new Set(conflicts.map(c => `${c.examKey}|${c.index}`)).size}건(회차별) 있습니다. 그 학생은 회차마다 따로 나옵니다.`})
            : null,
        el('div', {class: 'mt-3 grid gap-3 sm:grid-cols-2'}, [field('학급', classSelect), field('학생', studentSelect)]),
        detail,
    ]);
}

/** 사람의 대표 기록: 가장 나중 회차의 기록(반이 바뀌었으면 지금 반으로 묶는다) */
function latestRecord(p, exams) {
    const ordered = sortedExams(exams).filter(e => p.entries[e.key] !== undefined);
    const last = ordered.at(-1);
    return last ? last.students[p.entries[last.key]] : null;
}

const collator = new Intl.Collator('ko', {numeric: true});

/** 학년·반으로 묶은 학급 목록. 반이 없는 양식(김영일)의 학생은 「반 없음」으로 묶는다 */
function classGroups(persons, exams) {
    const map = new Map();
    for (const p of persons) {
        const s = latestRecord(p, exams);
        const grade = String(s?.grade_year ?? '').trim();
        const cls = String(s?.class ?? '').trim();
        const key = cls ? `${grade}|${cls}` : '|';
        const label = cls ? `${grade ? `${grade}학년 ` : ''}${cls}반` : '반 없음';
        if (!map.has(key)) map.set(key, {key, label, persons: []});
        map.get(key).persons.push(p);
    }
    const sortKey = (p) => { const s = latestRecord(p, exams); return `${s?.number ?? ''}|${s?.student_id ?? ''}|${s?.name ?? ''}`; };
    const groups = [...map.values()];
    groups.forEach(g => g.persons.sort((a, b) => collator.compare(sortKey(a), sortKey(b))));
    return groups.sort((a, b) => (a.key === '|') - (b.key === '|') || collator.compare(a.key, b.key));
}

/** 학생 드롭다운의 글: 「3번 홍길동」, 번호가 없으면 학번 */
function studentLabel(p, exams) {
    const s = latestRecord(p, exams);
    const number = String(s?.number ?? '').trim();
    const id = number ? `${number}번` : String(s?.student_id ?? '').trim();
    return `${id ? `${id} ` : ''}${s?.name ?? ''}`;
}


/** 학생을 가리키는 글: 학년 반 · 번호 이름 · 몇 회차(학급 드롭다운과 같은 가장 나중 회차의 기록). 반이 없으면 학번 */
function describe(p, exams) {
    const s = latestRecord(p, exams);
    const grade = String(s?.grade_year ?? '').trim();
    const cls = String(s?.class ?? '').trim();
    const room = cls ? `${grade ? `${grade}학년 ` : ''}${cls}반` : '';
    return [room, studentLabel(p, exams), `${Object.keys(p.entries).length}회`].filter(Boolean).join(' · ');
}

/* 학생별 영역 성적 차트에서 선택한 기준과 끈 과목. 학생을 바꾸거나 다시 그려도 유지한다 */
const SUBJECT_LINES = [['korean', '국어'], ['math', '수학'], ['inquiry1', '탐구1'], ['inquiry2', '탐구2']];
const SUBJECT_COLORS = {korean: '#0d9488', math: '#7c3aed', inquiry1: '#ea580c', inquiry2: '#0369a1'};
let subjectBasis = 'pct';
const hiddenSubjects = new Set();

const valueOf = (d, basis) => (basis === 'raw' ? rawOf(d) : (Number.isFinite(d?.[basis]) ? d[basis] : null));
const plain = (v) => (Number.isFinite(v) ? String(v) : DASH);

/** 줄을 누르면 그 회차의 이 학생 성적표를 연다 */
const openRecord = (r) => showStudentRecord(r.student, r.key);
const clickableRow = (r, cells) => el('tr', {
    class: 'cursor-pointer hover:bg-brand-soft', attrs: {tabindex: '0', title: `${r.key} 성적표 열기`},
    on: {click: () => openRecord(r), keydown: (e) => { if (e.key === 'Enter') openRecord(r); }},
}, cells);

/** 회차 분석에서 선택한 회차. 이 학생에게 없는 회차면 가장 나중 회차로 되돌린다 */
let analysisExam = null;

/** 회차 분석: 선택한 회차 하나 안에서 과목끼리 견준다(강약점) */
function analysisBlock(rows) {
    const present = rows.filter(r => r.student);
    if (!present.some(r => r.key === analysisExam)) analysisExam = present.at(-1)?.key ?? null;
    const block = el('div', {class: 'mt-3 rounded-xl border border-line p-4'});
    const draw = () => {
        clear(block);
        const r = present.find(x => x.key === analysisExam);
        const chips = el('div', {class: 'flex flex-wrap gap-2', attrs: {role: 'group', 'aria-label': '분석할 회차'}},
            present.map(x => el('button', {
                class: `rounded-full border px-4 py-1 text-base font-semibold ${x.key === analysisExam ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`,
                text: x.key, attrs: {type: 'button', 'aria-pressed': String(x.key === analysisExam)},
                on: {click: () => { analysisExam = x.key; draw(); }},
            })));
        block.append(el('div', {class: 'flex flex-wrap items-center justify-between gap-3'}, [
            el('h4', {class: 'text-lg font-bold', text: '회차 분석'}), chips,
        ]));
        if (!r) return;
        const {ranked, others, inquiryGap} = strengths(r.student);
        const th = (t, cls = '') => el('th', {class: `border-b border-line bg-canvas px-3 py-2 text-left font-semibold text-ink-soft whitespace-nowrap ${cls}`, text: t});
        const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-3 py-2 tabular-nums whitespace-nowrap ${cls}`, text: t});
        const canvas = el('canvas', {attrs: {id: 'trend-strength-chart'}});
        const table = el('table', {class: 'w-full text-base', attrs: {id: 'trend-strength-table'}}, [
            el('thead', {}, [el('tr', {}, [th('영역'), th('과목명'), th('백분위', 'text-right'), th('등급', 'text-right'), th('')])]),
            el('tbody', {}, [
                ...ranked.map(x => el('tr', {}, [td(x.label), td(x.subject || DASH), td(plain(x.pct), 'text-right font-semibold'), td(plain(x.grade), 'text-right'),
                    // 바로 아래 과목과 차이가 작으면 표시만 한다. 그 안의 차이로 강약을 나누지 않는다
                    td(x.similarToNext ? '≈ 아래 과목과 비슷함' : '', 'text-ink-soft')])),
                ...others.map(x => el('tr', {}, [td(x.label), td(x.subject || DASH), td(x.noPct ? '백분위 없음' : DASH, 'text-right text-ink-soft'), td(plain(x.grade), 'text-right'), td('')])),
            ]),
        ]);
        const notes = [
            `백분위가 큰 순서입니다. 이웃한 두 과목의 차이가 ${STRENGTH_SIMILAR} 이하이면 비슷하다고 봅니다. 탐구 백분위는 그 과목 응시자 안에서의 위치입니다. 영어·한국사는 등급만 적습니다.`,
            ...(inquiryGap !== null ? [`탐구 두 과목의 백분위 차이가 ${inquiryGap}입니다.`] : []),
        ];
        block.append(el('div', {class: 'mt-3 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start [&>*]:min-w-0'}, [
            ranked.length ? el('div', {class: 'relative h-60'}, [canvas]) : el('p', {class: 'rounded-lg bg-canvas px-4 py-3 text-base text-ink-soft', text: '이 회차에는 견줄 백분위가 없습니다.'}),
            el('div', {}, [
                el('div', {class: 'overflow-x-auto rounded-lg border border-line'}, [table]),
                ...notes.map(t => el('p', {class: 'mt-2 text-base text-ink-soft', text: t})),
            ]),
        ]));
        // 견줄 백분위가 없는 회차로 바꾸면 이전 회차의 막대가 떼어낸 캔버스에 남지 않게 지운다
        if (!ranked.length) { ST.charts.trendStrength?.destroy(); delete ST.charts.trendStrength; return; }
        drawChart('trendStrength', canvas, {
            type: 'bar',
            data: {
                labels: ranked.map(x => (x.subject ? `${x.label}(${x.subject})` : x.label)),
                datasets: [{data: ranked.map(x => x.pct), backgroundColor: ranked.map(x => SUBJECT_COLORS[x.area] ?? COLORS[0])}],
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {legend: {display: false}, tooltip: {callbacks: {label: (ctx) => ` 백분위 ${ctx.formattedValue}`}}},
                scales: {x: {min: PCT_MIN, max: PCT_MAX}},
            },
        });
    };
    draw();
    return block;
}

/** 회차별 수능최저 그래프에 그릴 n합 */
let csatN = 2;

/** 회차별 수능최저: 회차마다 2~5합. 과목 선택은 보고서 탭 수능최저의 선택을 그대로 따른다 */
function csatBlock(rows, keys) {
    const timeline = csatTimeline(rows, s => csatSumsOf(s));
    const picked = getCsatSubjects();
    const names = [...CSAT_SUBJECTS, ...CSAT_INQUIRY_MODES].filter(([k]) => picked.has(k)).map(([, label]) => label);
    const block = el('div', {class: 'mt-4 rounded-xl border border-line p-4'});
    const th = (t, cls = '') => el('th', {class: `border-b border-line bg-canvas px-3 py-2 text-left font-semibold text-ink-soft whitespace-nowrap ${cls}`, text: t});
    const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-3 py-2 tabular-nums whitespace-nowrap ${cls}`, text: t});
    const sumCell = (t, n) => {
        const v = t.sums[`sum${n}`];
        if (v === null) return td('— 과목 부족', 'text-right text-ink-soft');
        return el('td', {class: 'border-b border-line-soft px-3 py-2 text-right whitespace-nowrap'}, [
            el('div', {class: 'font-semibold tabular-nums', text: String(v)}),
            el('div', {class: 'text-base text-ink-soft', text: t.sums[`sum${n}_subj`]}),
        ]);
    };
    const table = el('table', {class: 'w-full text-base', attrs: {id: 'trend-csat-table'}}, [
        el('thead', {}, [el('tr', {}, [th('회차'), ...CSAT_AREAS.map(([, label]) => th(label, 'text-right')), ...[2, 3, 4, 5].map(n => th(`${n}합`, 'text-right'))])]),
        el('tbody', {}, rows.map((r, i) => {
            const t = timeline[i];
            if (t.absent) return el('tr', {}, [td(r.key, 'font-semibold'), el('td', {class: 'border-b border-line-soft px-3 py-2 text-ink-soft', attrs: {colspan: '9'}, text: '이 회차에는 없습니다'})]);
            if (t.noGrade) return el('tr', {}, [td(r.key, 'font-semibold'), el('td', {class: 'border-b border-line-soft px-3 py-2 text-ink-soft', attrs: {colspan: '9'}, text: '이 회차에는 등급이 없습니다'})]);
            return el('tr', {}, [td(r.key, 'font-semibold'), ...CSAT_AREAS.map(([k]) => td(plain(t.grades[k]), 'text-right')), ...[2, 3, 4, 5].map(n => sumCell(t, n))]);
        })),
    ]);
    const canvas = el('canvas', {attrs: {id: 'trend-csat-chart'}});
    const chips = el('div');
    const drawCsat = () => {
        clear(chips);
        chips.append(el('div', {class: 'flex flex-wrap gap-2', attrs: {role: 'group', 'aria-label': '그래프에 그릴 합'}},
            [2, 3, 4, 5].map(n => el('button', {
                class: `rounded-full border px-4 py-1 text-base font-semibold ${n === csatN ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`,
                text: `${n}합`, attrs: {type: 'button', 'aria-pressed': String(n === csatN)},
                on: {click: () => { csatN = n; drawCsat(); }},
            }))));
        // 합은 작을수록 좋으니 축을 뒤집어 위에 둔다. 결시·과목 부족 회차는 선이 끊긴다
        drawLine('trendCsat', canvas, keys, [{
            label: `${csatN}합`, data: timeline.map(t => (t.absent || t.noGrade ? null : t.sums[`sum${csatN}`])),
            borderColor: COLORS[1], backgroundColor: COLORS[1],
        }], {reverse: true, legend: false, tooltipLabel: (ctx) => ` ${csatN}합 ${ctx.formattedValue}`});
    };
    block.append(
        el('div', {class: 'flex flex-wrap items-center justify-between gap-3'}, [el('h4', {class: 'text-lg font-bold', text: '회차별 수능최저'}), chips]),
        el('p', {class: 'mt-1 text-base text-ink-soft', text: `보고서 탭 수능최저의 과목 선택을 따릅니다: ${names.length ? names.join(' · ') : '선택한 과목 없음'}`}),
        el('div', {class: 'mt-3 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start [&>*]:min-w-0'}, [
            el('div', {class: 'relative h-60'}, [canvas]),
            el('div', {class: 'overflow-x-auto rounded-lg border border-line'}, [table]),
        ]),
    );
    return {block, draw: drawCsat};
}

function renderPerson(root, person, exams, options, keys) {
    clear(root);
    // 석차는 등급으로 매기지 않는다(합산에 등급을 쓰지 않는다). 등급이면 영역 표만 쓰고 석차는 비운다
    const rankByGrade = rankBasis === 'grade';
    const rows = personTrend(person, exams, rankByGrade ? 'pct' : rankBasis, options);
    const th = (t, cls = '') => el('th', {class: `border-b border-line bg-canvas px-3 py-2 text-left font-semibold text-ink-soft whitespace-nowrap ${cls}`, text: t});
    const td = (t, cls = '') => el('td', {class: `border-b border-line-soft px-3 py-2 tabular-nums whitespace-nowrap ${cls}`, text: t});
    const absent = (r, span) => el('tr', {}, [td(r.key, 'font-semibold'), el('td', {class: 'border-b border-line-soft px-3 py-2 text-ink-soft', attrs: {colspan: String(span)}, text: '이 회차에는 없습니다'})]);

    // ── 회차별 영역 성적: 기준 칩과 과목 칩으로 선택한다 ──
    const subjectCanvas = el('canvas', {attrs: {id: 'trend-student-chart'}});
    const subjectBasisChips = el('div');
    const subjectChips = el('div', {class: 'flex flex-wrap gap-2', attrs: {role: 'group', 'aria-label': '과목'}});
    const drawSubjects = () => {
        clear(subjectBasisChips);
        clear(subjectChips);
        subjectBasisChips.append(basisChips(subjectBasis, (b) => { subjectBasis = b; drawSubjects(); }, '영역 성적 기준'));
        SUBJECT_LINES.forEach(([k, text]) => {
            const on = !hiddenSubjects.has(k);
            subjectChips.append(el('button', {
                class: `inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 text-base font-medium ${on ? 'text-ink' : 'text-ink-soft'}`,
                attrs: {type: 'button', 'aria-pressed': String(on)},
                on: {click: () => { if (on) hiddenSubjects.add(k); else hiddenSubjects.delete(k); drawSubjects(); }},
            }, [el('span', {class: 'inline-block size-3 rounded-full', style: {background: on ? SUBJECT_COLORS[k] : '#9ca3af'}}), el('span', {text})]));
        });
        const basisLabel = basisLabelOf(subjectBasis);
        // 차트는 칸 값 그대로 그린다(탐구1·2 같은 과목 병합은 표에만 적용)
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

    // 영역마다 직전 응시 회차 대비 변화(결시는 건너뛰고, 과목이 바뀌면 변화로 치지 않는다)
    const changes = Object.fromEntries(AREAS.map(([k]) => [k, changeVsPrev(rows, k)]));
    const subjectTable = el('table', {class: 'w-full text-base', attrs: {id: 'trend-subject-table'}}, [
        el('thead', {}, [el('tr', {}, [th('회차'), th('영역'), th('과목명'), th('원점수', 'text-right'), th('표준점수', 'text-right'), th('백분위', 'text-right'), th('등급', 'text-right'), th('직전 응시 대비')])]),
        el('tbody', {}, rows.flatMap((r, i) => (r.student
            ? AREAS.map(([k, text]) => {
                // 탐구1·2가 같은 과목이면 탐구1 줄에 합친 점수를 적는다(「직전 응시 대비」와 같은 점수). 탐구2 줄은 과목명만
                const merged = areaScore(r.student, k);
                const d = merged === MERGED ? {subject: r.student[k]?.subject} : (merged ?? {});
                return clickableRow(r, [td(r.key, 'font-semibold'), td(text), td(d.subject || DASH),
                    td(plain(rawOf(d)), 'text-right'), td(plain(d.std), 'text-right'), td(plain(d.pct), 'text-right'), td(plain(d.grade), 'text-right'),
                    td(changeText(changes[k][i]) || DASH, 'text-ink-soft')]);
            })
            : [absent(r, 7)]))),
    ]);

    // ── 합산 석차: 1등이 위로 가게 축을 뒤집는다 ──
    const rankCanvas = el('canvas', {attrs: {id: 'trend-rank-chart'}});

    root.append(
        el('p', {class: 'text-lg font-semibold', text: describe(person, exams)}),
        analysisBlock(rows),
        el('div', {class: 'mt-3 rounded-xl border border-line p-4'}, [
            el('div', {class: 'flex flex-wrap items-center justify-between gap-3'}, [
                el('h4', {class: 'text-lg font-bold', text: '회차별 영역 성적'}),
                subjectBasisChips,
            ]),
            el('div', {class: 'mt-3'}, [subjectChips]),
            // 넓은 화면에서는 차트와 표를 나란히 둔다. 영역 표는 길어서 차트가 따라 내려오게 붙여 둔다
            el('div', {class: 'mt-3 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start [&>*]:min-w-0'}, [
                el('div', {class: 'relative h-72 xl:sticky xl:top-4'}, [subjectCanvas]),
                el('div', {}, [
                    el('div', {class: 'overflow-x-auto rounded-lg border border-line'}, [subjectTable]),
                    el('p', {class: 'mt-2 text-base text-ink-soft', text: '직전 응시 대비는 그 영역을 응시한 바로 앞 회차와 견줍니다. 회차마다 응시 집단이 달라 백분위 차이에 그 영향이 섞입니다.'}),
                ]),
            ]),
        ]),
        el('div', {class: 'mt-4 rounded-xl border border-line p-4'}, [
            el('div', {class: 'flex flex-wrap items-center justify-between gap-3'}, [
                el('h4', {class: 'text-lg font-bold', text: '회차별 합산 석차'}),
                basisChips(rankBasis, (b) => { rankBasis = b; renderPerson(root, person, exams, options, keys); }, '합산 석차 기준'),
            ]),
            el('div', {class: 'mt-3 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start [&>*]:min-w-0'}, [
            rankByGrade
                ? el('p', {class: 'rounded-lg bg-canvas px-4 py-3 text-base text-ink-soft', text: '등급으로는 합산 석차를 매기지 않습니다. 백분위·원점수·표준점수 중 하나를 선택하세요.'})
                : el('div', {class: 'relative h-60'}, [rankCanvas]),
            el('div', {class: 'overflow-x-auto rounded-lg border border-line'}, [el('table', {class: 'w-full text-base', attrs: {id: 'trend-rank-table'}}, [
                el('thead', {}, [el('tr', {}, [th('회차'), th('합산'), th('합산 석차'), th('국어'), th('수학'), th('탐구평균'), th('영어 등급')])]),
                el('tbody', {}, rows.map(r => (r.student ? clickableRow(r, [
                    td(r.key, 'font-semibold'), td(fmt(r.total)), td(r.rank ? `${r.rank} / ${r.of}` : DASH),
                    td(fmt(r.kor)), td(fmt(r.math)), td(fmt(r.inq)), td(fmt(r.engGrade, 0)),
                ]) : absent(r, 6)))),
            ])]),
            ]),
        ]),
    );
    const csat = csatBlock(rows, keys);
    root.append(csat.block);
    drawSubjects();
    csat.draw();
    if (rankByGrade) return;
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
