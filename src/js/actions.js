/* 마크업과 코드를 잇는 자리.
 *
 * 예전에는 index.html과, JS가 문자열로 만들어 innerHTML에 넣는 마크업에
 * onclick="parseData()" 처럼 함수 이름이 직접 박혀 있었다. 인라인 핸들러는 전역
 * 스코프에서만 이름을 찾기 때문에, 모듈로 옮긴 뒤에도 함수 21개를 window에
 * 다시 올려 줘야 했다. 이름을 바꾸면 마크업이 조용히 깨지고, 어떤 함수가 화면에
 * 묶여 있는지도 코드만 봐서는 알 수 없었다.
 *
 * 지금은 마크업에 data-action="parse-data" 처럼 '무엇을 한다'만 적고, 그 이름을
 * 실제 함수에 잇는 일을 이 파일이 맡는다. window에 올리는 것은 없다.
 *
 * document에 한 번만 걸어 두고 위임하므로, 나중에 innerHTML로 새로 그린
 * 마크업도 다시 묶어 줄 필요 없이 바로 동작한다.
 */
import {
    clearFile,
    exportTo,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    loadSampleData,
    parseData,
    renderRawPreview,
    selectFormat,
    switchTab,
} from './main.js';
import {renderAll, setGlobalBasis} from './report.js';
import {
    closeModal,
    handleRowClick,
    printStudentDetail,
    showCsatStudents,
    showSelectedSubjectStudents,
} from './report/report-modal.js';
import {handleClassChange} from './report/report-csat-sum.js';
import {renderScoreDistribution} from './report/report-score-distribution.js';
import {renderSubjectsCharts} from './report/report-render-chart-subjects.js';

/** data-action 값 → 눌렀을 때 할 일. 인자는 (누른 요소, 이벤트). */
const CLICK_ACTIONS = {
    'switch-tab': (el) => switchTab(el.dataset.tab),
    'set-basis': (el) => setGlobalBasis(el.dataset.basis),
    'close-modal': (el) => closeModal(el.dataset.modal),
    'clear-file': () => clearFile(),
    'parse-data': () => parseData(),
    'load-sample': () => loadSampleData(),
    'print-page': () => window.print(),
    'print-student': () => printStudentDetail(),
    'select-format': (el) => selectFormat(el.dataset.format),
    'export-to': (el) => exportTo(el.dataset.format),
    'row-click': (el) => handleRowClick(el),
    'csat-students': (el) => showCsatStudents(Number(el.dataset.sum), Number(el.dataset.index)),
    'subject-students': (el) => showSelectedSubjectStudents(el.dataset.type, el.dataset.subject),

    // 숨겨 둔 file input을 대신 눌러 준다. input.click()이 만든 클릭도 위로
    // 올라오는데, 그걸 다시 잡으면 자기 자신을 무한히 부른다. 그래서 걸러낸다.
    'open-file-picker': (el, event) => {
        if (event.target.id === 'fileInput') return;
        document.getElementById('fileInput').click();
    },
};

/** data-change 값 → 값이 바뀌었을 때 할 일. */
const CHANGE_ACTIONS = {
    'file-select': (el, event) => handleFileSelect(event),
    'render-raw-preview': () => renderRawPreview(),
    'render-all': () => renderAll(),
    'render-score-distribution': () => renderScoreDistribution(),
    'render-subjects-charts': () => renderSubjectsCharts(),
    'class-change': () => handleClassChange(),
};

function delegate(type, attribute, table) {
    document.addEventListener(type, (event) => {
        const el = event.target.closest(`[${attribute}]`);
        if (!el) return;
        const run = table[el.getAttribute(attribute)];
        if (run) run(el, event);
    });
}

export function initActions() {
    delegate('click', 'data-action', CLICK_ACTIONS);
    delegate('change', 'data-change', CHANGE_ACTIONS);

    // 드래그 앤 드롭은 위임하지 않는다. 드롭존 하나에만 걸리고, dragover에서
    // preventDefault를 해야 브라우저가 파일을 새 탭으로 열어 버리지 않는다.
    const dropzone = document.getElementById('dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', handleDragOver);
        dropzone.addEventListener('dragleave', () => handleDragLeave());
        dropzone.addEventListener('drop', handleDrop);
    }
}
