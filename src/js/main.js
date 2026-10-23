import ExcelJS from 'exceljs';
import {GradeExporter} from './exporter.js';
import {addExam} from './exams/examStore.js';
import {blockers, commitRows, prepareUploads, renderImportTable} from './ui/importer.js';
import {renderReport} from './report.js';
import {SCHEMAS} from './schema.js';

export {sheetjsTo2DArray} from './ingest/files.js';

/* ───────────────────────────────────────────
       § 애플리케이션 상태 (ST) 및 로직
    ─────────────────────────────────────────── */
export const ST = {
    exams: [],      // 회차 목록 (exams/examStore.js)
    activeExamKey: null,
    charts: {}
};

/* ST.data 는 지금 고른 회차의 학생 목록이다. 리포트 모듈들은 예전처럼 ST.data 만 읽는다.
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

// ExcelJS 셀 값을 문자열·숫자 같은 평범한 값으로 푼다.
// 수식의 계산 결과도 다시 이 함수를 거친다. 결과가 #N/A 같은 에러 객체인데 그대로
// 두면 이름 칸이 "[object Object]" 가 되어 학생으로 섞여 들어갔다.
function cellToPlain(val) {
    if (val === null || val === undefined) return '';
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
            // ExcelJS 의 cell.value 는 수식 결과가 0 이나 '' 이면 result 를 빼고 돌려준다.
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
    ['upload', 'report', 'export'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
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
    showToast('파일을 읽는 중입니다…');
    const {rows, skipped} = await prepareUploads(files);
    const known = new Set(IMPORT.rows.map(r => r.hash));
    IMPORT.rows.push(...rows.filter(r => !known.has(r.hash)));
    IMPORT.skipped = skipped;
    renderImports();
    showToast(rows.length ? `${rows.length}개 파일을 표에 올렸습니다. 확인한 뒤 「불러오기」를 누르세요.` : '읽을 수 있는 엑셀 파일이 없습니다.', !rows.length);
}

/** 표에서 고른 파일들을 회차로 넣는다 */
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
    ST.activeExamKey = result.notes[result.notes.length - 1]?.key ?? ST.activeExamKey;
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
    document.getElementById('export-summary').innerHTML = `
            <div class="py-8 text-center text-slate-400 text-base font-medium">
                <i class="fa-solid fa-inbox text-4xl mb-3 block text-slate-200"></i>
                불러온 데이터가 없습니다
            </div>
        `;
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
    if (!ST.data) return;
    document.getElementById('export-summary').innerHTML = `
            <div class="bg-blue-50 text-blue-700 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <span class="font-bold block">파싱 완료 데이터</span>
                    <span class="text-base">현재 ${ST.data.length}명의 데이터가 메모리에 있습니다.</span>
                </div>
                <i class="fa-solid fa-database text-2xl opacity-50"></i>
            </div>
        `;

    document.getElementById('export-cards').innerHTML = Object.values(SCHEMAS).map(s => `
            <div class="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between
                        transition hover:border-blue-300 hover:shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-${s.color}-100 flex items-center justify-center">
                        <i class="fa-solid ${s.icon} text-${s.color}-600 text-lg"></i>
                    </div>
                    <div>
                        <h2 class="font-bold text-slate-800">${s.label} 양식으로 내보내기</h2>
                    </div>
                </div>
                <button data-action="export-to" data-format="${s.id}"
                        class="bg-white border border-${s.color}-200 text-${s.color}-600 hover:bg-${s.color}-50
                               px-4 py-2 rounded-lg text-base font-bold transition">
                    <i class="fa-solid fa-download mr-1.5"></i>다운로드
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
   § 샘플 데이터 로드 (현실적인 랜덤 데이터 생성)
─────────────────────────────────────────── */
export function loadSampleData() {
    const dummy = [];

    // 무작위 이름 생성을 위한 성/이름 배열
    const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'];
    const firstNames = ['서준', '하준', '도윤', '시우', '민준', '지호', '예준', '주원', '건우', '우진', '지안', '수아', '서윤', '서연', '하윤', '지우', '하은', '민서', '윤서', '채원', '도현', '준서', '민재', '현우', '승우', '지민', '수현', '지원', '다은', '은지'];

    const subjectsKor = ['화법과 작문', '언어와 매체'];
    const subjectsMath = ['확률과 통계', '미적분', '기하'];
    const subjectsInq = ['생활과 윤리', '윤리와 사상', '한국지리', '세계지리', '동아시아사', '세계사', '경제', '정치와 법', '사회·문화', '물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ'];

    // 원점수 기반 등급 계산
    const getGrade = (raw, max) => {
        const r = raw / max;
        if (r >= 0.9) return 1;
        if (r >= 0.8) return 2;
        if (r >= 0.7) return 3;
        if (r >= 0.6) return 4;
        if (r >= 0.5) return 5;
        if (r >= 0.4) return 6;
        if (r >= 0.3) return 7;
        if (r >= 0.2) return 8;
        return 9;
    };

    // 정규분포(Normal Distribution) 난수 생성 함수 (Box-Muller Transform)
    const randn_bm = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // 평균(mean)과 표준편차(stdDev)를 이용해 점수 생성
    const generateScore = (mean, stdDev, max) => {
        let score = Math.round(mean + randn_bm() * stdDev);
        if (score > max) score = max;
        if (score < 0) score = 0;
        return score;
    };

    // 100명의 랜덤 학생 생성
    for (let i = 1; i <= 100; i++) {
        const name = lastNames[Math.floor(Math.random() * lastNames.length)] +
            firstNames[Math.floor(Math.random() * firstNames.length)];
        const cls = String(Math.floor(Math.random() * 5) + 1); // 1반 ~ 5반

        // 현실적인 점수 분포 설정 (과목별 평균 및 표준편차 조정)
        const korRaw = generateScore(65, 15, 100);
        const mathRaw = generateScore(55, 20, 100);
        const engRaw = generateScore(60, 18, 100);
        const inq1Raw = generateScore(30, 10, 50);
        const inq2Raw = generateScore(30, 10, 50);
        const histRaw = generateScore(35, 8, 50);
        // 탐구 두 과목은 서로 다른 과목이다. 따로 뽑으면 같은 과목이 두 번 나온다
        const inq1Subject = subjectsInq[Math.floor(Math.random() * subjectsInq.length)];
        const inq2Choices = subjectsInq.filter(sub => sub !== inq1Subject);
        const inq2Subject = inq2Choices[Math.floor(Math.random() * inq2Choices.length)];

        dummy.push({
            exam_year: String(new Date().getFullYear()),
            grade_year: '3',
            class: cls,
            number: '0', // 정렬 후 재할당
            name: name,
            korean: {
                subject: subjectsKor[Math.floor(Math.random() * subjectsKor.length)],
                common_raw: null,
                select_raw: null,
                raw: korRaw,
                std: Math.floor(korRaw * 0.8 + 50),
                pct: Math.floor((korRaw / 100) * 100),
                grade: getGrade(korRaw, 100)
            },
            math: {
                subject: subjectsMath[Math.floor(Math.random() * subjectsMath.length)],
                common_raw: null,
                select_raw: null,
                raw: mathRaw,
                std: Math.floor(mathRaw * 0.9 + 40),
                pct: Math.floor((mathRaw / 100) * 100),
                grade: getGrade(mathRaw, 100)
            },
            english: {
                raw: engRaw,
                std: null,
                pct: null,
                grade: getGrade(engRaw, 100)
            },
            inquiry1: {
                subject: inq1Subject,
                raw: inq1Raw,
                std: Math.floor(inq1Raw * 1.2 + 20),
                pct: Math.floor((inq1Raw / 50) * 100),
                grade: getGrade(inq1Raw, 50)
            },
            inquiry2: {
                subject: inq2Subject,
                raw: inq2Raw,
                std: Math.floor(inq2Raw * 1.2 + 20),
                pct: Math.floor((inq2Raw / 50) * 100),
                grade: getGrade(inq2Raw, 50)
            },
            hist: {
                raw: histRaw,
                std: null,
                pct: null,
                grade: getGrade(histRaw, 50)
            },
            fl2: {
                subject: '',
                raw: null,
                std: null,
                pct: null,
                grade: null
            }
        });
    }

    // 반, 이름 순으로 정렬 후 번호 1번부터 예쁘게 재할당
    dummy.sort((a, b) => {
        // 1. 반(class) 비교: parseInt의 한계를 벗어난 안전한 문자/숫자 혼합 정렬
        const classA = String(a.class || "");
        const classB = String(b.class || "");
        if (classA !== classB) {
            return classA.localeCompare(classB, undefined, {numeric: true});
        }

        // 2. 이름(name) 비교: null/undefined로 인한 TypeError 완벽 방어
        const nameA = String(a.name || "");
        const nameB = String(b.name || "");
        return nameA.localeCompare(nameB);
    });

    let currentClass = '';
    let numCounter = 1;
    dummy.forEach(s => {
        if (s.class !== currentClass) {
            currentClass = s.class;
            numCounter = 1;
        }
        s.number = String(numCounter++);
    });

    // 샘플은 「샘플」 회차 하나로 넣는다. 이미 있으면 그 회차를 새 샘플로 바꾼다
    ST.exams = addExam(ST.exams.filter(e => e.key !== '샘플'), {key: '샘플', formatId: null, fileName: '', fileHash: '', students: dummy});
    ST.activeExamKey = '샘플';
    showToast('샘플 데이터 100명이 로드되었습니다.');

    afterExamsChanged();
    renderReport();
    renderExportCards();
    switchTab('report');
}
/* 회차 목록이 바뀐 뒤: 지금 회차가 없어졌으면 첫 회차를 고르고, 머리줄을 다시 그린다.
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
