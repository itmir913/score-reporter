import {moveExam, removeExam, renameExam, sortedExams} from '../exams/examStore.js';
import {PRIVACY_WARNING, PROJECT_EXTENSION, parseProject, serializeProject} from '../exams/projectFile.js';
import {afterExamsChanged, renderExportCards, showToast, ST, switchTab} from '../main.js';
import {globalReportBasis, includeNoInquiry, renderReport, setGlobalBasis} from '../report.js';
import {dlBlob} from '../utils.js';
import {el, clear} from './dom.js';

/* ───────────────────────────────────────────
   § 회차 레일 (머리줄)
   회차를 순서대로 칩으로 늘어놓는다. 칩을 누르면 그 회차를 보고, ◀ ▶ 로 순서를 옮기고,
   이름을 바꾸거나 지울 수 있다. 순서는 통계 화면의 가로축이 된다.
─────────────────────────────────────────── */

export function renderExamRail() {
    const rail = document.getElementById('exam-rail');
    if (!rail) return;
    const list = sortedExams(ST.exams);
    clear(rail);
    if (!list.length) {
        rail.append(el('span', {class: 'text-base text-ink-soft', text: '아직 불러온 회차가 없습니다'}));
        return;
    }
    list.forEach((exam, i) => {
        const active = exam.key === ST.activeExamKey;
        rail.append(el('div', {
            class: `exam-chip ${active ? 'is-active' : ''}`,
            attrs: {'data-exam': exam.key, role: 'group', 'aria-label': `${exam.key} 회차`},
        }, [
            el('button', {
                class: 'exam-chip-move', text: '◀',
                attrs: {type: 'button', title: '앞으로', 'aria-label': `${exam.key} 앞으로`, disabled: i === 0},
                on: {click: () => update(moveExam(ST.exams, exam.key, -1))},
            }),
            el('button', {
                class: 'exam-chip-name', text: exam.key,
                attrs: {type: 'button', 'aria-pressed': String(active), title: `${exam.fileName || exam.key} · ${exam.students.length}명`},
                on: {click: () => selectExam(exam.key)},
            }),
            el('button', {
                class: 'exam-chip-move', text: '▶',
                attrs: {type: 'button', title: '뒤로', 'aria-label': `${exam.key} 뒤로`, disabled: i === list.length - 1},
                on: {click: () => update(moveExam(ST.exams, exam.key, +1))},
            }),
            el('button', {
                class: 'exam-chip-move', text: '✎',
                attrs: {type: 'button', title: '이름 바꾸기', 'aria-label': `${exam.key} 이름 바꾸기`},
                on: {click: () => renameAsk(exam.key)},
            }),
            el('button', {
                class: 'exam-chip-move', text: '✕',
                attrs: {type: 'button', title: '이 회차 지우기', 'aria-label': `${exam.key} 지우기`},
                on: {click: () => removeAsk(exam.key)},
            }),
        ]));
    });
}

function update(exams) {
    ST.exams = exams;
    afterExamsChanged();
}

export function selectExam(key) {
    ST.activeExamKey = key;
    afterExamsChanged();
    renderReport();
    renderExportCards();
    switchTab('report');
}

function renameAsk(key) {
    const next = prompt('회차 이름을 입력하세요 (예: 2026-03, 3, 사설)', key);
    if (next === null) return;
    try {
        const wasActive = ST.activeExamKey === key;
        ST.exams = renameExam(ST.exams, key, next);
        if (wasActive) ST.activeExamKey = next.normalize('NFC').trim();
        afterExamsChanged();
        renderReport();
    } catch (e) {
        showToast(e.message, true);
    }
}

function removeAsk(key) {
    if (!confirm(`「${key}」 회차를 지울까요? 저장하지 않았다면 되돌릴 수 없습니다.`)) return;
    update(removeExam(ST.exams, key));
    renderReport();
    renderExportCards();
}

/* ── 프로젝트 저장·불러오기 ── */

export function saveProject() {
    if (!ST.exams.length) return showToast('저장할 회차가 없습니다.', true);
    if (!confirm(`${PRIVACY_WARNING}\n\n저장할까요?`)) return;
    const text = serializeProject({exams: ST.exams, options: {basis: globalReportBasis, includeNoInquiry: includeNoInquiry()}});
    const stamp = new Date().toISOString().slice(0, 10);
    dlBlob(new Blob([text], {type: 'application/json'}), `모의고사-분석-${stamp}${PROJECT_EXTENSION}`);
    showToast(`${ST.exams.length}개 회차를 저장했습니다.`);
}

export async function openProject(file) {
    if (!file) return;
    try {
        const {exams, options} = parseProject(await file.text());
        if (ST.exams.length && !confirm('지금 불러온 회차를 모두 지우고 프로젝트 파일로 바꿀까요?')) return;
        ST.exams = exams;
        ST.activeExamKey = null;
        afterExamsChanged();
        const box = document.getElementById('include-no-inquiry');
        if (box) box.checked = options.includeNoInquiry === true;
        renderReport();
        if (['raw', 'std', 'pct'].includes(options.basis)) setGlobalBasis(options.basis);
        renderExportCards();
        switchTab('report');
        showToast(`${exams.length}개 회차를 불러왔습니다.`);
    } catch (e) {
        showToast(e.message, true);
    } finally {
        const input = document.getElementById('projectInput');
        if (input) input.value = '';
    }
}
