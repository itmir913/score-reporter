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
    document.querySelectorAll('.format-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`fmt-${id}`).classList.add('selected');

    document.getElementById('sheet-area').classList.remove('hidden');
    document.getElementById('parse-btn').classList.remove('hidden');

    const s = SCHEMAS[id];
    document.getElementById('format-detail').innerHTML = `
            <p class="mb-2 font-bold text-slate-600">${s.label} 지원 필드</p>
            <div>${Object.entries(s.fields).map(([k, v]) => `<span class="ftag ${v ? 'ftag-on' : 'ftag-off'}">${k}</span>`).join('')}</div>
        `;
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
    thead.innerHTML = `<tr>${Array(maxCol).fill(0).map((_, i) => `<th class="px-3 py-2 border-b">Col ${i}</th>`).join('')}</tr>`;

    tbody.innerHTML = rows.slice(0, Math.min(rows.length, 5)).map((r, i) => `
            <tr class="${i < SCHEMAS[ST.fmtId].headerRows ? 'bg-amber-50 text-amber-700' : ''}">
                ${Array(maxCol).fill(0).map((_, ci) => `<td class="px-3 py-1 border-b whitespace-nowrap">${r[ci] !== undefined ? r[ci] : ''}</td>`).join('')}
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