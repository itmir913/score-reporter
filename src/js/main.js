import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {GradeExporter} from './exporter.js';
import {GradeDataParser} from './parser.js';
import {renderReport, setGlobalBasis} from './report.js';
import {FIELD_LABELS, SCHEMAS} from './schema.js';
import {escapeAttr, sameInquirySubject} from './utils.js';
import {
    decryptXlsx,
    EncryptedLegacyXlsError,
    isEncryptedOfficeFile,
    readCfb,
    WrongPasswordError
} from './xlsx-decrypt.js';

/* ───────────────────────────────────────────
       § 애플리케이션 상태 (ST) 및 로직
    ─────────────────────────────────────────── */
export const ST = {
    wb: null,
    file: null,
    fmtId: null,
    data: null, // parsed records
    charts: {}
};

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

// SheetJS 시트를 A1 부터 시작하는 2차원 배열로 바꾼다.
// sheet_to_json 은 !ref 의 시작 칸부터 읽는다. 1행이나 A열이 통째로 비어 있으면
// !ref 가 A2·B1 같은 곳에서 시작하고, 그만큼 행·열이 앞으로 당겨진다. 그러면
// 머리글 행 수와 열 문자가 어긋나 첫 학생이 빠지거나 옆 열을 읽는다. 시작을 A1 로 고정한다.
export function sheetjsTo2DArray(sheet) {
    if (!sheet || !sheet['!ref']) return [];
    const {e} = XLSX.utils.decode_range(sheet['!ref']);
    return XLSX.utils.sheet_to_json(sheet, {header: 1, defval: null, range: {s: {r: 0, c: 0}, e}});
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

// 파일 초기화
export function clearFile() {
    ST.wb = null;
    ST.file = null;
    ST.fmtId = null;
    ST.data = null;
    ST.cache = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('dropzone').classList.remove('hidden');
    document.getElementById('format-area').classList.add('hidden');
    document.getElementById('sheet-area').classList.add('hidden');
    document.getElementById('parse-btn').classList.add('hidden');
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('badge-text').innerText = '데이터 없음';
    document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-slate-300';

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
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
}

export function handleFileSelect(e) {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
}

// 파일 읽기 차례. 앞 파일을 읽는(암호를 푸는) 동안 다른 파일을 올리면, 늦게 끝난
// 앞 파일이 화면과 ST.wb 를 덮어썼다. 기다림이 끝날 때마다 내가 마지막 파일인지 본다
let loadSeq = 0;

// ★ 변경: 비동기(async) 방식으로 ExcelJS 적용 및 비밀번호 프롬프트 추가
export async function processFile(file) {
    // 끌어다 놓기는 accept 를 거치지 않는다. 다른 형식은 빈 통합 문서가 되어
    // 시트 0개로 "성공" 을 띄웠다. 읽기 전에 막는다. 차례 번호를 올리거나 비우기 전이라
    // 지금 보던 데이터와 읽고 있던 파일은 그대로 남는다
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
        // 파일 선택 칸만 비운다. 남겨 두면 같은 파일을 다시 골라도 change 가 일지 않아 알림이 없다
        const input = document.getElementById('fileInput');
        if (input) input.value = '';
        return showToast('지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv)', true);
    }

    const seq = ++loadSeq;
    const superseded = () => seq !== loadSeq;
    clearFile();

    // ★ 개선 1: 파일 처리를 시작하기 전에 로딩 안내 띄우기
    showToast("파일을 분석하는 중입니다. 잠시만 기다려주세요...");

    // ★ 개선 2: UI가 그려질(Toast가 뜰) 시간을 주기 위해 메인 스레드를 잠깐 쉬게 함 (매우 중요)
    await new Promise(resolve => setTimeout(resolve, 50));
    if (superseded()) return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        if (superseded()) return;

        let wb = new ExcelJS.Workbook(); // 미리 생성

        // 확장자는 .xlsx 인데 속은 옛 .xls(OLE2) 인 파일이 있다. 암호 정보가 없으면
        // 비밀번호를 묻지 않고 .xls 처럼 SheetJS 로 읽는다.
        // 컨테이너는 한 번만 읽어 암호 확인과 해제가 함께 쓴다
        const cfb = fileExt === 'xlsx' ? readCfb(arrayBuffer) : null;
        const isEncrypted = !!cfb && isEncryptedOfficeFile(arrayBuffer, cfb);
        const isLegacyXls = !!cfb && !isEncrypted;

        if (fileExt === 'xls' || fileExt === 'csv' || isLegacyXls) {
            // [최적화 2] .xls와 .csv는 SheetJS가 훨씬 빠릅니다.
            let xlsWorkbook;
            if (fileExt === 'csv') {
                let csvText = '';
                try {
                    csvText = new TextDecoder('utf-8', {fatal: true}).decode(arrayBuffer);
                } catch {
                    csvText = new TextDecoder('euc-kr').decode(arrayBuffer);
                }
                xlsWorkbook = XLSX.read(csvText, {type: 'string'});
            } else {
                try {
                    xlsWorkbook = XLSX.read(arrayBuffer, {type: 'array'});
                } catch (e) {
                    // 암호가 걸린 옛 .xls 는 "손상된 파일" 이 아니다. 무엇을 하면 되는지 알린다.
                    // 암호 정보(/EncryptionInfo)가 있는 것은 새 형식이 이름만 .xls 인 파일이라 뺀다
                    if (/password-protected/i.test(e?.message) && (isLegacyXls || !isEncryptedOfficeFile(arrayBuffer))) {
                        throw new EncryptedLegacyXlsError();
                    }
                    throw e;
                }
            }

            // [최적화 3] addRow 반복문 대신 addRows 일괄 처리
            xlsWorkbook.SheetNames.forEach(sheetName => {
                const newWs = wb.addWorksheet(sheetName);
                const jsonData = sheetjsTo2DArray(xlsWorkbook.Sheets[sheetName]);
                newWs.addRows(jsonData); // 한 줄씩 addRow 하는 것보다 훨씬 빠름
            });
        } else if (fileExt === 'xlsx') {
            /* 암호가 걸린 xlsx 는 zip 이 아니라 OLE2 컨테이너로 저장된다. ExcelJS 는
             * 그걸 그대로 zip 으로 읽으려다 실패하므로, 먼저 우리가 풀어서 넘긴다. */
            let data = arrayBuffer;
            if (isEncrypted) {
                const pwd = prompt("암호가 걸려있는 엑셀 파일입니다.\n비밀번호를 입력해주세요.");
                if (superseded()) return;
                if (pwd === null) return showToast("취소되었습니다.", true);

                showToast("암호를 해제하는 중입니다. 잠시만 기다려주세요...");
                await new Promise(r => setTimeout(r, 50));
                if (superseded()) return;
                data = await decryptXlsx(arrayBuffer, pwd, cfb);
                if (superseded()) return;
            }
            await wb.xlsx.load(data);
            if (superseded()) return;
        }

        // 공통 마무리 로직
        ST.wb = wb;
        ST.file = file;

        const sheetNames = wb.worksheets.map(ws => ws.name); // eachSheet보다 간결함

        document.getElementById('dropzone').classList.add('hidden');
        document.getElementById('file-info').classList.remove('hidden');
        document.getElementById('file-name').innerText = file.name;
        document.getElementById('file-meta').innerText = `크기: ${(file.size / 1024).toFixed(1)} KB | 시트 수: ${sheetNames.length}`;

        const sel = document.getElementById('sheet-select');
        // 시트 이름에는 " 나 & 가 들어갈 수 있다. 그대로 넣으면 value 가 잘려 시트를 못 찾는다.
        sel.innerHTML = sheetNames.map(s => `<option value="${escapeAttr(s)}">${escapeAttr(s)}</option>`).join('');

        renderFormatCards();
        document.getElementById('format-area').classList.remove('hidden');
        showToast("데이터를 성공적으로 불러왔습니다.");

    } catch (err) {
        if (superseded()) return; // 이미 다른 파일을 읽고 있다. 앞 파일의 오류는 알리지 않는다
        console.error("파일 처리 에러:", err);
        showToast(err instanceof WrongPasswordError
            ? '비밀번호가 올바르지 않습니다. 파일을 다시 올려 주세요.'
            : err instanceof EncryptedLegacyXlsError
                ? '암호가 걸린 옛 형식(.xls) 파일은 지원하지 않습니다. 엑셀에서 암호를 풀거나 .xlsx 로 저장해 주세요.'
                : '파일을 읽는 데 실패했습니다. 파일이 손상되었을 수 있습니다.', true);
    }
}

// 양식 선택 UI
export function renderFormatCards() {
    const cont = document.getElementById('format-cards');
    cont.innerHTML = Object.values(SCHEMAS).map(s => `
            <div class="format-card border-2 border-slate-200 rounded-xl p-4 flex items-center justify-between"
                 data-action="select-format" data-format="${s.id}" id="fmt-${s.id}">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-${s.color}-100 flex items-center justify-center">
                        <i class="fa-solid ${s.icon} text-${s.color}-600"></i>
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 text-base">${s.label}</p>
                        <p class="text-base text-slate-400">헤더 ${s.headerRows}행</p>
                    </div>
                </div>
                <div class="fmt-check hidden w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                    <i class="fa-solid fa-check text-base"></i>
                </div>
            </div>
        `).join('');
}

export function selectFormat(id) {
    ST.fmtId = id;
    document.querySelectorAll('.format-card').forEach(el => {
        el.classList.remove('selected', 'border-blue-500', 'bg-blue-50', 'ring-2', 'ring-blue-200');
        el.classList.add('border-slate-200');
        const check = el.querySelector('.fmt-check');
        if (check) check.classList.add('hidden');
    });

    const selectedCard = document.getElementById(`fmt-${id}`);
    if (selectedCard) {
        selectedCard.classList.remove('border-slate-200');
        selectedCard.classList.add('selected', 'border-blue-500', 'bg-blue-50', 'ring-2', 'ring-blue-200');
        const check = selectedCard.querySelector('.fmt-check');
        if (check) check.classList.remove('hidden');
    }

    document.getElementById('sheet-area').classList.remove('hidden');
    document.getElementById('parse-btn').classList.remove('hidden');

    const s = SCHEMAS[id];
    document.getElementById('format-detail').innerHTML = Object.entries(FIELD_LABELS).map(([k, korName]) => {
        const isSupported = s.fields[k] && s.fields[k].trim() !== '';
        return `<span class="ftag ${isSupported ? 'ftag-on' : 'ftag-off'}">${korName}</span>`;
    }).join('');

    renderRawPreview();
}

// 원본 데이터 미리보기 (ExcelJS 로직 적용)
export function renderRawPreview() {
    if (!ST.wb || !ST.fmtId) return;
    const sheetName = document.getElementById('sheet-select').value;
    const ws = ST.wb.getWorksheet(sheetName);
    const rows = exceljsTo2DArray(ws); // ExcelJS 시트를 2차원 배열로 변환

    const thead = document.getElementById('preview-thead');
    const tbody = document.getElementById('preview-tbody');

    if (rows.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td class="p-3 text-center">데이터가 없습니다.</td></tr>';
        return;
    }

    const PREVIEW_ROW_COUNT = 7;
    const maxCol = Math.max(0, ...rows.slice(0, PREVIEW_ROW_COUNT).map(r => r.length));
    const schema = SCHEMAS[ST.fmtId];

    const idxToKey = {};
    if (schema && schema._idx) {
        for (const [key, idx] of Object.entries(schema._idx)) {
            if (idx !== null && idx !== undefined) {
                idxToKey[idx] = key;
            }
        }
    }

    thead.innerHTML = `<tr>${Array(maxCol).fill(0).map((_, i) => {
        const mappedKey = idxToKey[i];
        const korLabel = mappedKey ? FIELD_LABELS[mappedKey] : '';
        if (korLabel) {
            return `<th class="px-4 py-4 border-b-2 border-slate-200 whitespace-nowrap text-left align-middle bg-slate-100 z-10">
                <span class="text-base font-extrabold text-blue-700 tracking-tight">${korLabel}</span>
            </th>`;
        } else {
            return `<th class="px-4 py-4 border-b-2 border-slate-200 whitespace-nowrap text-left align-middle bg-slate-100 z-10">
                <span class="text-base font-medium text-slate-400">Col ${i}</span>
            </th>`;
        }
    }).join('')}</tr>`;

    const truncateText = (text, maxLength = 15) => {
        if (text === undefined || text === null || text === '') return '';
        const str = String(text);
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    };

    tbody.innerHTML = rows.slice(0, Math.min(rows.length, PREVIEW_ROW_COUNT)).map((r, i) => `
            <tr class="${i < schema.headerRows ? 'bg-amber-100 text-amber-950 font-semibold' : 'hover:bg-slate-50 transition-colors'}">
                ${Array(maxCol).fill(0).map((_, ci) => {
        const originalText = r[ci] !== undefined ? r[ci] : '';
        return `<td class="px-4 py-3 border-b border-slate-100 whitespace-nowrap text-base text-slate-700 cursor-default" title="${escapeAttr(originalText)}">
                        ${escapeAttr(truncateText(originalText, 15))}
                    </td>`;
    }).join('')}
            </tr>
        `).join('');

    document.getElementById('preview-section').classList.remove('hidden');
    const showingCount = Math.min(rows.length, PREVIEW_ROW_COUNT);
    document.getElementById('preview-count').innerText = `총 ${rows.length}행 중 ${showingCount}행`;
}

// 데이터 파싱 실행
export function parseData() {
    if (!ST.wb || !ST.fmtId) return;
    try {
        const sheetName = document.getElementById('sheet-select').value;
        const parser = new GradeDataParser(SCHEMAS[ST.fmtId]);
        ST.data = parser.parse(ST.wb, sheetName);

        // 원점수 열이 비어 있는 파일(대교협 실채점 등)은 원점수 기준이면 표·분포가 모두 빈다.
        // 국어·수학·탐구 원점수가 아무에게도 없으면 표준점수 기준으로 바꿔 보여 준다.
        // 원점수가 있으면 사용자가 고른 기준을 그대로 둔다
        const noRaw = ST.data.length > 0 && !ST.data.some(s =>
            ['korean', 'math', 'inquiry1', 'inquiry2'].some(subj => Number.isFinite(s[subj]?.raw)));

        // 알림은 한 번에 하나만 보인다. 안내와 경고를 성공 문구에 합치고, 경고가 있으면 오류 알림으로 띄운다
        const sameInq = ST.data.filter(sameInquirySubject).length;
        const msg = [`${ST.data.length}명의 데이터를 파싱했습니다.`];
        if (sameInq > 0) msg.push(`${sameInq}명의 탐구1·탐구2 과목이 같습니다. 원본 파일을 확인해 주세요.`);
        if (noRaw) msg.push('원점수가 없는 파일이라 표준점수 기준으로 보여 줍니다.');
        showToast(msg.join(' '), sameInq > 0);
        document.getElementById('badge-text').innerText = `${ST.data.length}명 로드됨`;
        document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-green-500';

        renderReport();
        if (noRaw) setGlobalBasis('std'); // 버튼 모양도 함께 바꾼다
        renderExportCards();
        switchTab('report');
        window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (err) {
        console.error(err);
        showToast('데이터 파싱 중 오류가 발생했습니다.', true);
    }
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

    ST.data = dummy;
    showToast('샘플 데이터 100명이 로드되었습니다.');
    document.getElementById('badge-text').innerText = '샘플 데이터 (100명)';
    document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-blue-500';

    renderReport();
    renderExportCards();
    switchTab('report');
}