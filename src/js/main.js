import ExcelJS from 'exceljs';
import {GradeExporter} from './exporter.js';
import {addExam} from './exams/examStore.js';
import {blockers, commitRows, prepareUploads, renderImportTable} from './ui/importer.js';
import {renderReport} from './report.js';
import {generateSampleExams, SAMPLE_KEYS, SAMPLE_SIZE} from './sample.js';
import {SCHEMAS} from './schema.js';
import {escapeAttr} from './utils.js';

export {sheetjsTo2DArray} from './ingest/files.js';

/* ───────────────────────────────────────────
       § 애플리케이션 상태 (ST) 및 로직
    ─────────────────────────────────────────── */
export const ST = {
    exams: [],      // 회차 목록 (exams/examStore.js)
    activeExamKey: null,
    charts: {}
};

/* ST.data 는 지금 선택한 회차의 학생 목록이다. 리포트 모듈들은 예전처럼 ST.data 만 읽는다.
 * 대입하면 지금 회차의 학생을 바꾸고, 회차가 없으면 「현재」 회차를 만든다. null 이면 모든 회차를 비운다 */
Object.defineProperty(ST, 'data', {
    enumerable: true,
    get() {
        return ST.exams.find(e => e.key === ST.activeExamKey)?.students ?? null;
    },
    set(students) {
        if (students === null || students === undefined) {
            ST.exams = [];
            ST.activeExamKey = null;
            return;
        }
        if (ST.exams.some(e => e.key === ST.activeExamKey)) {
            ST.exams = ST.exams.map(e => (e.key === ST.activeExamKey ? {...e, students} : e));
        } else {
            ST.exams = addExam(ST.exams, {key: '현재', formatId: null, fileName: '', fileHash: '', students});
            ST.activeExamKey = '현재';
        }
    },
});

// ExcelJS 셀 값을 문자열·숫자 같은 평범한 값으로 바꾼다.
// 수식의 계산 결과도 다시 이 함수를 거친다. 결과가 #N/A 같은 에러 객체인데 그대로
// 두면 이름 칸이 "[object Object]" 가 되어 학생으로 섞여 들어갔다.
function cellToPlain(val) {
    if (val === null || val === undefined) return '';
    // 참/거짓 셀은 이름·점수 어느 쪽으로도 뜻이 없다. 빈칸으로 둔다(「true」라는 학생이 생기지 않게)
    if (typeof val === 'boolean') return '';
    if (typeof val !== 'object') return val;
    if (val instanceof Date) return val.toISOString().split('T')[0]; // 날짜 형식
    if ('formula' in val || 'sharedFormula' in val || 'result' in val) {
        return val.result === undefined ? '' : cellToPlain(val.result); // 수식 셀은 계산된 값
    }
    if (val.error !== undefined) return ''; // 에러 셀인 경우 빈칸
    if (Array.isArray(val.richText)) return val.richText.map(r => r.text || '').join(''); // 서식 있는 텍스트
    // 하이퍼링크 셀은 {text, hyperlink} 로 온다. 보이는 글자를 버리면 이름이 링크로
    // 걸린 학생이 통째로 빠진다. text 가 다시 서식 있는 텍스트일 수도 있다.
    if (val.text !== undefined) return cellToPlain(val.text);
    return ''; // 그 외 객체 타입
}

// ExcelJS 워크시트를 2차원 배열(SheetJS의 sheet_to_json({header:1}) 형태)로 변환하는 헬퍼 함수
export function exceljsTo2DArray(ws) {
    if (!ws) return [];
    const result = [];
    ws.eachRow({includeEmpty: true}, function (row, rowNumber) {
        const rowData = [];
        row.eachCell({includeEmpty: true}, function (cell, colNumber) {
            // ExcelJS 의 cell.value 는 수식 결과가 0 이나 '' 이면 result 를 생략하고 돌려준다.
            // 그대로 쓰면 수식으로 낸 0점이 빈칸(미응시)이 되므로 결과는 cell.result 로 읽는다.
            const val = cell.type === ExcelJS.ValueType.Formula ? {result: cell.result} : cell.value;
            rowData[colNumber - 1] = cellToPlain(val);
        });

        // 빈 셀을 ''로 채우기
        for (let i = 0; i < rowData.length; i++) {
            if (rowData[i] === undefined) rowData[i] = '';
        }
        result[rowNumber - 1] = rowData;
    });

    // 중간에 비어있는 행 배열 초기화
    for (let i = 0; i < result.length; i++) {
        if (!result[i]) result[i] = [];
    }
    return result;
}

// 탭 전환 로직
export function switchTab(tabId) {
    ['upload', 'report', 'trend', 'export'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    // 탭을 바꾸면 새 탭을 맨 위부터 보인다. 미는 것은 문서다
    globalThis.scrollTo?.({top: 0});
}

// 토스트 알림
export let toastTimeout;

export function showToast(msg, isErr = false) {
    const toast = document.getElementById('toast');
    const iconBg = document.getElementById('toast-icon-bg');
    const icon = document.getElementById('toast-icon');
    const msgEl = document.getElementById('toast-msg');

    msgEl.innerText = msg;

    if (isErr) {
        iconBg.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500/20';
        icon.className = 'fa-solid fa-triangle-exclamation text-red-400';
    } else {
        iconBg.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/20';
        icon.className = 'fa-solid fa-check text-green-400';
    }

    toast.classList.remove('opacity-0', 'translate-y-12');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-12');
    }, 3000);
}

/* ───────────────────────────────────────────
   § 파일 추가 (여러 파일을 한 표에서 확인하고 한 번에 불러오기)
─────────────────────────────────────────── */

/** 불러오기 표의 상태. 회차로 넣기 전의 파일들 */
export const IMPORT = {rows: [], skipped: []};

export function renderImports() {
    const root = document.getElementById('import-area');
    if (!root) return;
    renderImportTable(root, IMPORT, {existing: () => ST.exams, onCommit: commitImports});
    document.getElementById('dropzone-hint')?.classList.toggle('hidden', IMPORT.rows.length > 0);
}

/** 올린 파일·zip 을 표에 더한다. 같은 파일(내용 해시)이 이미 표에 있으면 다시 넣지 않는다 */
export async function addUploads(files) {
    const input = document.getElementById('fileInput');
    if (input) input.value = '';
    showToast('엑셀 파일을 읽는 중입니다…');
    const {rows, skipped} = await prepareUploads(files, {
        onProgress: (i, n) => showToast(`엑셀 파일을 읽는 중입니다 (${i}/${n})`),
    });
    // 표에 있던 것뿐 아니라 이번 묶음 안의 같은 파일(예: a.xlsx 와 그것을 담은 zip)도 한 번만 넣는다
    const known = new Set(IMPORT.rows.map(r => r.hash));
    for (const r of rows) {
        if (known.has(r.hash)) continue;
        known.add(r.hash);
        IMPORT.rows.push(r);
    }
    // 앞 묶음의 건너뛴 안내를 덮지 않고 잇는다
    IMPORT.skipped = [...IMPORT.skipped, ...skipped];
    renderImports();
    // 올린 파일이 드롭존 아래 표에 나타난다. 화면 밖이면 반응이 없는 줄 알기 쉬우니 표로 스크롤한다
    if (rows.length || skipped.length) scrollToImports();
    showToast(rows.length ? `${rows.length}개 파일을 목록에 추가했습니다.` : '읽을 수 있는 엑셀 파일이 없습니다.', !rows.length);
}

/* 불러오기 표로 부드럽게 스크롤한다. 애니메이션이 돌지 않는 환경(화면을 그리지 않는 창 등)에서는
 * 잠시 뒤에도 표가 화면 밖이면 그때 바로 옮긴다 */
function scrollToImports() {
    const area = document.getElementById('import-area');
    if (!area?.scrollIntoView) return;
    area.scrollIntoView({behavior: 'smooth', block: 'start'});
}

/** 표에서 선택한 파일들을 회차로 넣는다 */
export function commitImports() {
    if (blockers(IMPORT.rows, ST.exams).length) return;
    let result;
    try {
        result = commitRows(IMPORT.rows, ST.exams);
    } catch (err) {
        console.error(err);
        showToast('데이터를 읽는 중 오류가 발생했습니다.', true);
        return;
    }
    ST.exams = result.exams;
    ST.activeExamKey = result.latestKey ?? ST.activeExamKey;
    IMPORT.rows = IMPORT.rows.filter(r => !r.include);
    IMPORT.skipped = [];
    afterExamsChanged();
    renderImports();
    renderReport();
    renderExportCards();
    // 알림은 한 번에 하나만 보인다. 회차마다의 경고를 한 줄로 모은다
    const warned = result.notes.filter(n => n.warn.length);
    showToast([`${result.notes.length}개 회차를 불러왔습니다.`, ...warned.map(n => `「${n.key}」 ${n.warn.join(', ')}.`)].join(' '), warned.length > 0);
    if (!IMPORT.rows.length) switchTab('report');
}

/* 모든 회차와 불러오기 표를 비운다 */
export function clearAll() {
    IMPORT.rows = [];
    IMPORT.skipped = [];
    renderImports();
    ST.data = null;
    ST.cache = null;
    afterExamsChanged();
    // 데이터를 비웠으면 리포트와 내보내기 화면도 빈 상태로 되돌린다. 그대로 두면
    // 이전 파일의 리포트가 남아, 거기서 행을 누르거나 선택을 바꿀 때 비어 있는
    // ST.data 를 건드려 오류가 났다.
    renderReport();
    document.getElementById('export-cards').innerHTML = '';
    document.getElementById('export-summary').innerHTML = '';
    document.getElementById('export-empty')?.classList.remove('hidden');
    document.getElementById('export-body')?.classList.add('hidden');
}

// 드래그 앤 드롭
export function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropzone').classList.add('drag-over');
}

export function handleDragLeave() {
    document.getElementById('dropzone').classList.remove('drag-over');
}

export function handleDrop(e) {
    e.preventDefault();
    handleDragLeave();
    if (e.dataTransfer.files.length > 0) addUploads([...e.dataTransfer.files]);
}

export function handleFileSelect(e) {
    if (e.target.files.length > 0) addUploads([...e.target.files]);
}

/* ───────────────────────────────────────────
   § 내보내기 탭 렌더링
─────────────────────────────────────────── */
export function renderExportCards() {
    const has = !!ST.data;
    document.getElementById('export-empty')?.classList.toggle('hidden', has);
    document.getElementById('export-body')?.classList.toggle('hidden', !has);
    if (!has) return;
    document.getElementById('export-summary').innerHTML = `
            <p class="font-semibold">「${escapeAttr(ST.activeExamKey)}」 회차 · ${ST.data.length}명</p>
            <p class="text-ink-soft">이 회차를 아래 양식으로 내보냅니다. 회차는 상단에서 바꿉니다.</p>
        `;

    document.getElementById('export-cards').innerHTML = Object.values(SCHEMAS).map(s => `
            <div class="card flex flex-col items-start gap-3 px-5 py-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                <p class="min-w-0 text-lg font-semibold">${escapeAttr(s.label)} 양식</p>
                <button type="button" data-action="export-to" data-format="${s.id}" class="btn shrink-0 whitespace-nowrap">
                    <i class="fa-solid fa-download"></i>내려받기
                </button>
            </div>
        `).join('');
}

// ★ 변경: 내보내기가 비동기 버퍼 쓰기를 요구하므로 async 추가
export async function exportTo(formatId) {
    if (!ST.data) {
        showToast('파싱된 데이터가 없습니다.', true);
        return;
    }
    try {
        const target = SCHEMAS[formatId];
        const fileName = `성적데이터_${target.label}변환_${new Date().getTime()}.xlsx`;
        await GradeExporter.toXlsx(ST.data, target, fileName);
        showToast(`${target.label} 양식으로 내보냈습니다.`);
    } catch (err) {
        console.error(err);
        showToast('내보내기 중 오류가 발생했습니다.', true);
    }
}

/* ───────────────────────────────────────────
   § 샘플 데이터 로드 (가상 학생으로 만든 3월·6월·9월 회차, sample.js)
─────────────────────────────────────────── */
export function loadSampleData() {
    // 이미 있는 샘플 회차는 새 샘플로 바꾼다. 다른 회차는 그대로 둔다
    let exams = ST.exams.filter(e => !SAMPLE_KEYS.includes(e.key));
    for (const {key, students} of generateSampleExams()) {
        exams = addExam(exams, {key, formatId: null, fileName: '', fileHash: '', students});
    }
    ST.exams = exams;
    ST.activeExamKey = SAMPLE_KEYS[SAMPLE_KEYS.length - 1];
    showToast(`샘플 ${SAMPLE_KEYS.length}회차(학생 ${SAMPLE_SIZE}명)를 불러왔습니다.`);

    afterExamsChanged();
    renderReport();
    renderExportCards();
    switchTab('report');
}

/* 회차 목록이 바뀐 뒤: 지금 회차가 없어졌으면 첫 회차를 고르고, 상단바를 다시 그린다.
 * 리포트는 부르는 쪽이 다시 그린다. 회차 레일은 ui/examRail.js 가 onExamsChanged 로 받는다 */
let examsListener = () => {};
export function onExamsChanged(listener) {
    examsListener = listener;
}

export function afterExamsChanged() {
    if (!ST.exams.some(e => e.key === ST.activeExamKey)) {
        ST.activeExamKey = [...ST.exams].sort((a, b) => a.order - b.order)[0]?.key ?? null;
    }
    const badge = document.getElementById('badge-text');
    if (badge) badge.innerText = ST.exams.length ? `${ST.exams.length}개 회차` : '데이터 없음';
    examsListener();
}
