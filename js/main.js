/* ───────────────────────────────────────────
       § 애플리케이션 상태 (ST) 및 로직
    ─────────────────────────────────────────── */
const ST = {
    wb: null,
    file: null,
    fmtId: null,
    data: null, // parsed records
    charts: {}
};


// 영문 변수명을 한글 라벨로 변환해주는 매핑 사전
const FIELD_LABELS = {
    grade_year: '학년',
    class: '반',
    number: '번호',
    name: '이름',
    kor_subject: '국어_선택과목명',
    kor_common_raw: '국어_공통원점수',
    kor_select_raw: '국어_선택원점수',
    kor_raw: '국어_원점수',
    kor_std: '국어_표준점수',
    kor_pct: '국어_백분위',
    kor_grade: '국어_등급',
    math_subject: '수학_선택과목명',
    math_common_raw: '수학_공통원점수',
    math_select_raw: '수학_선택원점수',
    math_raw: '수학_원점수',
    math_std: '수학_표준점수',
    math_pct: '수학_백분위',
    math_grade: '수학_등급',
    eng_raw: '영어_원점수',
    eng_std: '영어_표준점수',
    eng_pct: '영어_백분위',
    eng_grade: '영어_등급',
    inq1_subject: '탐구1_과목명',
    inq1_raw: '탐구1_원점수',
    inq1_std: '탐구1_표준점수',
    inq1_pct: '탐구1_백분위',
    inq1_grade: '탐구1_등급',
    inq2_subject: '탐구2_과목명',
    inq2_raw: '탐구2_원점수',
    inq2_std: '탐구2_표준점수',
    inq2_pct: '탐구2_백분위',
    inq2_grade: '탐구2_등급',
    hist_raw: '한국사_원점수',
    hist_std: '한국사_표준점수',
    hist_pct: '한국사_백분위',
    hist_grade: '한국사_등급',
    fl2_subject: '제2외국어_과목명',
    fl2_raw: '제2외국어_원점수',
    fl2_std: '제2외국어_표준점수',
    fl2_pct: '제2외국어_백분위',
    fl2_grade: '제2외국어_등급'
};

// 탭 전환 로직
function switchTab(tabId) {
    ['upload', 'report', 'export'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
}

// 토스트 알림
let toastTimeout; // 여러 번 클릭해도 타이머가 꼬이지 않도록 변수 선언

function showToast(msg, isErr = false) {
    const toast = document.getElementById('toast');
    const inner = document.getElementById('toast-inner');
    const iconBg = document.getElementById('toast-icon-bg');
    const icon = document.getElementById('toast-icon');
    const msgEl = document.getElementById('toast-msg');

    // 메시지 입력
    msgEl.innerText = msg;

    // 상태에 따른 디자인 변경 (성공 vs 에러)
    if (isErr) {
        iconBg.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500/20';
        icon.className = 'fa-solid fa-triangle-exclamation text-red-400';
        inner.classList.add('border', 'border-red-500/30');
    } else {
        iconBg.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/20';
        icon.className = 'fa-solid fa-check text-green-400';
        inner.classList.remove('border', 'border-red-500/30');
    }

    // 애니메이션 실행 (나타나기)
    toast.classList.remove('opacity-0', 'translate-y-12');

    // 기존 타이머 초기화 (연속 클릭 방지)
    if (toastTimeout) clearTimeout(toastTimeout);

    // 3초 뒤에 사라지기
    toastTimeout = setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-12');
    }, 3000);
}

// 파일 초기화
function clearFile() {
    ST.wb = null;
    ST.file = null;
    ST.fmtId = null;
    ST.data = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('dropzone').classList.remove('hidden');
    document.getElementById('format-area').classList.add('hidden');
    document.getElementById('sheet-area').classList.add('hidden');
    document.getElementById('parse-btn').classList.add('hidden');
    document.getElementById('preview-section').classList.add('hidden');

    document.getElementById('badge-text').innerText = '데이터 없음';
    document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-slate-300';
}

// 드래그 앤 드롭
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropzone').classList.add('drag-over');
}

function handleDragLeave() {
    document.getElementById('dropzone').classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    handleDragLeave();
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
}

function processFile(file) {
    clearFile();
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            ST.wb = XLSX.read(data, {type: 'array'});
            ST.file = file;

            document.getElementById('dropzone').classList.add('hidden');
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('file-name').innerText = file.name;
            document.getElementById('file-meta').innerText = `크기: ${(file.size / 1024).toFixed(1)} KB | 시트 수: ${ST.wb.SheetNames.length}`;

            const sel = document.getElementById('sheet-select');
            sel.innerHTML = ST.wb.SheetNames.map(s => `<option value="${s}">${s}</option>`).join('');

            renderFormatCards();
            document.getElementById('format-area').classList.remove('hidden');
        } catch (err) {
            showToast('엑셀 파일을 읽는 데 실패했습니다.', true);
        }
    };
    reader.readAsArrayBuffer(file);
}

// 양식 선택 UI
function renderFormatCards() {
    const cont = document.getElementById('format-cards');
    cont.innerHTML = Object.values(SCHEMAS).map(s => `
            <div class="format-card border-2 border-slate-200 rounded-xl p-4 flex items-center justify-between"
                 onclick="selectFormat('${s.id}')" id="fmt-${s.id}">
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

function selectFormat(id) {
    ST.fmtId = id;

    // 1. 선택된 카드 디자인 활성화
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

    // 2. 우측 "양식 지원 필드" 렌더링 (★ FIELD_LABELS 기준으로 순서 고정!)
    document.getElementById('format-detail').innerHTML = Object.entries(FIELD_LABELS).map(([k, korName]) => {
        // 현재 선택된 양식(schema)에서 해당 키(k)가 지원되는지(값이 있는지) 확인
        const isSupported = s.fields[k] && s.fields[k].trim() !== '';

        return `<span class="ftag ${isSupported ? 'ftag-on' : 'ftag-off'}">${korName}</span>`;
    }).join('');

    renderRawPreview();
}

// 원본 데이터 미리보기
function renderRawPreview() {
    if (!ST.wb || !ST.fmtId) return;
    const sheet = document.getElementById('sheet-select').value;
    const rows = XLSX.utils.sheet_to_json(ST.wb.Sheets[sheet], {header: 1, defval: ''});

    const thead = document.getElementById('preview-thead');
    const tbody = document.getElementById('preview-tbody');

    if (rows.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td class="p-3 text-center">데이터가 없습니다.</td></tr>';
        return;
    }

    const maxCol = Math.max(...rows.slice(0, 10).map(r => r.length));
    const schema = SCHEMAS[ST.fmtId];

    // 전역 FIELD_LABELS 사용 (main.js 상단에 정의되어 있어야 함)

    // 1. 선택된 양식의 매핑 데이터를 가져와 '컬럼 인덱스'를 기준으로 역매핑
    const idxToKey = {};
    if (schema && schema._idx) {
        for (const [key, idx] of Object.entries(schema._idx)) {
            if (idx !== null && idx !== undefined) {
                idxToKey[idx] = key;
            }
        }
    }

    // 2. ★ 테이블 헤더(Thead) 렌더링 - 강조 스타일 적용
    thead.innerHTML = `<tr>${Array(maxCol).fill(0).map((_, i) => {
        const mappedKey = idxToKey[i];
        const korLabel = mappedKey ? FIELD_LABELS[mappedKey] : '';

        if (korLabel) {
            // 매핑된 열: 굵고 더 큰 파란색 텍스트(text-base), 배경색 약간 어둡게(bg-slate-100)
            return `<th class="px-4 py-4 border-b-2 border-slate-200 whitespace-nowrap text-left align-middle bg-slate-100 z-10">
                <span class="text-base font-extrabold text-blue-700 tracking-tight">${korLabel}</span>
            </th>`;
        } else {
            // 매핑되지 않은 열: 연한 회색으로 Col 번호만 출력 (크기는 text-base 유지)
            return `<th class="px-4 py-4 border-b-2 border-slate-200 whitespace-nowrap text-left align-middle bg-slate-100 z-10">
                <span class="text-base font-medium text-slate-400">Col ${i}</span>
            </th>`;
        }
    }).join('')}</tr>`;

    // 텍스트를 지정한 길이(15자)만큼만 자르는 헬퍼 함수
    const truncateText = (text, maxLength = 15) => {
        if (text === undefined || text === null || text === '') return '';
        const str = String(text);
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    };

    // 3. ★ 테이블 본문(Tbody) 렌더링 - 노란색 배경 진하게 적용
    tbody.innerHTML = rows.slice(0, Math.min(rows.length, 5)).map((r, i) => `
            <tr class="${i < schema.headerRows ? 'bg-amber-100 text-amber-950 font-semibold' : 'hover:bg-slate-50 transition-colors'}">
                ${Array(maxCol).fill(0).map((_, ci) => {
        const originalText = r[ci] !== undefined ? r[ci] : '';
        // td 태그의 title 속성에 원본 텍스트를 넣어 마우스 호버 시 툴팁으로 보이게 함
        return `<td class="px-4 py-3 border-b border-slate-100 whitespace-nowrap text-base text-slate-700 cursor-default" title="${originalText}">
                        ${truncateText(originalText, 15)}
                    </td>`;
    }).join('')}
            </tr>
        `).join('');

    document.getElementById('preview-section').classList.remove('hidden');
    document.getElementById('preview-count').innerText = `총 ${rows.length}행 중 5행`;
}

// 데이터 파싱 실행
function parseData() {
    if (!ST.wb || !ST.fmtId) return;
    try {
        const sheet = document.getElementById('sheet-select').value;
        const parser = new GradeDataParser(SCHEMAS[ST.fmtId]);
        ST.data = parser.parse(ST.wb, sheet);

        showToast(`${ST.data.length}명의 데이터를 파싱했습니다.`);

        // 배지 업데이트
        document.getElementById('badge-text').innerText = `${ST.data.length}명 로드됨`;
        document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-green-500';

        renderReport();
        renderExportCards();
        switchTab('report');
    } catch (err) {
        console.error(err);
        showToast('데이터 파싱 중 오류가 발생했습니다.', true);
    }
}

/* ───────────────────────────────────────────
   § 내보내기 탭 렌더링
─────────────────────────────────────────── */
function renderExportCards() {
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
                        <h3 class="font-bold text-slate-800">${s.label} 양식으로 내보내기</h3>
                        <p class="text-base text-slate-500 mt-0.5">선택 시 .xlsx 파일이 다운로드됩니다.</p>
                    </div>
                </div>
                <button onclick="exportTo('${s.id}')"
                        class="bg-white border border-${s.color}-200 text-${s.color}-600 hover:bg-${s.color}-50
                               px-4 py-2 rounded-lg text-base font-bold transition">
                    <i class="fa-solid fa-download mr-1.5"></i>다운로드
                </button>
            </div>
        `).join('');
}

function exportTo(formatId) {
    if (!ST.data) {
        showToast('파싱된 데이터가 없습니다.', true);
        return;
    }
    try {
        const target = SCHEMAS[formatId];
        const fileName = `성적데이터_${target.label}변환_${new Date().getTime()}.xlsx`;
        GradeExporter.toXlsx(ST.data, target, fileName);
        showToast(`${target.label} 양식으로 내보냈습니다.`);
    } catch (err) {
        console.error(err);
        showToast('내보내기 중 오류가 발생했습니다.', true);
    }
}

/* ───────────────────────────────────────────
   § 샘플 데이터 로드 (테스트용)
─────────────────────────────────────────── */
function loadSampleData() {
    const dummy = [];
    for (let i = 1; i <= 50; i++) {
        dummy.push({
            grade_year: '3', class: '1', number: String(i), name: `학생${i}`,
            korean: {std: 100 + Math.floor(Math.random() * 40), grade: Math.ceil(Math.random() * 9)},
            math: {std: 90 + Math.floor(Math.random() * 50), grade: Math.ceil(Math.random() * 9)},
            english: {grade: Math.ceil(Math.random() * 9)},
            inquiry1: {std: 50 + Math.floor(Math.random() * 20)},
            inquiry2: {std: 45 + Math.floor(Math.random() * 25)}
        });
    }
    ST.data = dummy;
    showToast('샘플 데이터 50명이 로드되었습니다.');
    document.getElementById('badge-text').innerText = '샘플 데이터 (50명)';
    document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-blue-500';

    renderReport();
    renderExportCards();
    switchTab('report');
}