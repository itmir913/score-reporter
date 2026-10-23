import {moveExam, removeExam, renameExam, sortedExams} from '../exams/examStore.js';
import {afterExamsChanged, renderExportCards, showToast, ST, switchTab} from '../main.js';
import {renderReport} from '../report.js';
import {el, clear} from './dom.js';

/* ───────────────────────────────────────────
   § 회차 레일 (상단바)
   회차를 순서대로 칩으로 늘어놓는다. 칩을 누르면 그 회차를 보고, ◀ ▶ 로 순서를 옮기고,
   이름을 바꾸거나 지울 수 있다. 순서는 통계 화면의 가로축이 된다.
─────────────────────────────────────────── */

export function renderExamRail() {
    const rail = document.getElementById('exam-rail');
    if (!rail) return;
    const list = sortedExams(ST.exams);
    clear(rail);
    if (!list.length) {
        // 좁은 화면에서 줄이 바뀌어 상단바 밖으로 넘치지 않게 한 줄로 두고 말줄임한다
        rail.append(el('span', {class: 'truncate whitespace-nowrap text-base text-ink-soft', text: '불러온 회차 없음'}));
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
                attrs: {type: 'button', 'aria-pressed': String(active), title: `${exam.key}${exam.fileName ? ` · ${exam.fileName}` : ""} · ${exam.students.length}명`},
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
    showActiveChip();
}

/** 좁은 화면에서 지금 회차가 회차 줄 밖에 있으면 보이는 곳까지 옆으로 민다(페이지는 움직이지 않는다) */
function showActiveChip() {
    const rail = document.getElementById('exam-rail');
    const chip = rail?.querySelector('.exam-chip.is-active');
    if (!chip) return;
    const left = chip.offsetLeft - rail.offsetLeft;
    // 칩이 줄보다 넓으면 이름이 보이게 왼쪽 끝을 맞춘다
    if (left < rail.scrollLeft || chip.offsetWidth > rail.clientWidth) rail.scrollLeft = left;
    else if (left + chip.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = left + chip.offsetWidth - rail.clientWidth;
}

// 창 너비가 바뀌면 회차 줄 너비도 바뀐다. 지금 회차가 가려지지 않게 다시 맞춘다
window.addEventListener('resize', showActiveChip);

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
