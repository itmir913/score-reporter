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

// 1. (추가) 스크립트 상단 쯤에 Buffer를 백그라운드에서 미리 로드해둡니다.
let GlobalBuffer = null;
import('https://esm.sh/buffer')
    .then(module => {
        GlobalBuffer = module.Buffer;
    })
    .catch(err => console.error("Buffer 프리로드 실패:", err));

// ExcelJS 워크시트를 2차원 배열(SheetJS의 sheet_to_json({header:1}) 형태)로 변환하는 헬퍼 함수
function exceljsTo2DArray(ws) {
    if (!ws) return [];
    const result = [];
    ws.eachRow({includeEmpty: true}, function (row, rowNumber) {
        const rowData = [];
        row.eachCell({includeEmpty: true}, function (cell, colNumber) {
            let val = cell.value;
            if (val !== null && val !== undefined) {
                if (val.result !== undefined) val = val.result; // 수식 셀인 경우 계산된 값
                else if (val.error !== undefined) val = '';     // 에러 셀인 경우 빈칸
                else if (val instanceof Date) val = val.toISOString().split('T')[0]; // 날짜 형식
            } else {
                val = '';
            }
            rowData[colNumber - 1] = val;
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
function switchTab(tabId) {
    ['upload', 'report', 'export'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
}

// 토스트 알림
let toastTimeout;

function showToast(msg, isErr = false) {
    const toast = document.getElementById('toast');
    const inner = document.getElementById('toast-inner');
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

// ★ 변경: 비동기(async) 방식으로 ExcelJS 적용 및 비밀번호 프롬프트 추가
async function processFile(file) {
    clearFile();

    // ★ 개선 1: 파일 처리를 시작하기 전에 로딩 안내 띄우기
    showToast("파일을 분석하는 중입니다. 잠시만 기다려주세요...");

    // ★ 개선 2: UI가 그려질(Toast가 뜰) 시간을 주기 위해 메인 스레드를 잠깐 쉬게 함 (매우 중요)
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileExt = file.name.split('.').pop().toLowerCase();

        // ★ 개선 3: 미리 로드해둔 Buffer 객체 사용 (네트워크 지연 제거)
        // (xlsx 파싱을 위해 ExcelJS가 요구하는 Buffer 규격 충족)
        if (!GlobalBuffer) {
            const {Buffer} = await import('https://esm.sh/buffer');
            GlobalBuffer = Buffer;
        }

        // 가져온 Buffer를 이용해 데이터 변환
        const fileBuffer = GlobalBuffer.from(arrayBuffer);

        let wb; // 분기 후 공통으로 사용할 ExcelJS 워크북 객체

        if (fileExt === 'xls') {
            // ─────────────────────────────────────────
            // [분기 1] .xls 파일: SheetJS로 읽고 ExcelJS 객체로 변환
            // ─────────────────────────────────────────
            if (typeof XLSX === 'undefined') {
                showToast("구형 엑셀 파싱 라이브러리(SheetJS)가 필요합니다.", true);
                return;
            }

            try {
                // SheetJS로 arrayBuffer 직접 읽기
                const xlsWorkbook = XLSX.read(arrayBuffer, {type: 'array'});

                // 기존 호환성을 위해 ExcelJS 워크북 생성
                wb = new ExcelJS.Workbook();

                xlsWorkbook.SheetNames.forEach(sheetName => {
                    const newWs = wb.addWorksheet(sheetName);
                    const xlsWs = xlsWorkbook.Sheets[sheetName];
                    const sheetData = XLSX.utils.sheet_to_json(xlsWs, {header: 1, defval: null});

                    sheetData.forEach(row => {
                        newWs.addRow(row);
                    });
                });
            } catch (xlsErr) {
                console.error("SheetJS 파싱 에러:", xlsErr);
                showToast(".xls 파일을 읽는 데 실패했습니다.", true);
                return;
            }

        } else if (fileExt === 'xlsx') {
            // ─────────────────────────────────────────
            // [분기 2] .xlsx 파일: 기존 Buffer 적용 및 암호 처리 로직
            // ─────────────────────────────────────────
            wb = new ExcelJS.Workbook();

            try {
                // 1. 일반 로드 시도
                await wb.xlsx.load(fileBuffer);
            } catch (err) {
                // 2. 에러 발생 시: 암호 입력 프롬프트 띄우기
                const pwd = prompt("암호가 걸려있는 엑셀 파일입니다.\n비밀번호를 입력해주세요.");
                if (pwd === null) {
                    showToast("파일 읽기가 취소되었습니다.", true);
                    return;
                }

                // 복호화 시작 전 다시 한번 로딩 상태를 확실히 안내
                showToast("암호를 해제하고 데이터를 읽는 중입니다. 파일 크기에 따라 수십 초 이상 걸릴 수 있습니다...", false);
                await new Promise(resolve => setTimeout(resolve, 50)); // UI 렌더링 시간 확보

                try {
                    // 3. 사용자가 입력한 비밀번호로 재시도
                    await wb.xlsx.load(fileBuffer, {password: pwd});
                    showToast("암호가 성공적으로 해제되었습니다.");
                } catch (pwdErr) {
                    console.error("복호화 에러:", pwdErr);
                    showToast("비밀번호가 틀렸거나 손상된 파일입니다.", true);
                    return;
                }
            }
        } else {
            showToast("지원하지 않는 파일 형식입니다. (.xls 또는 .xlsx 파일만 가능)", true);
            return;
        }

        // ─────────────────────────────────────────
        // [공통 처리 영역] 이후 로직은 기존과 완전히 동일 (wb가 세팅됨)
        // ─────────────────────────────────────────
        ST.wb = wb;
        ST.file = file;

        // 시트 이름 배열 추출
        const sheetNames = [];
        wb.eachSheet(function (worksheet) {
            sheetNames.push(worksheet.name);
        });

        /* ... 이후 UI 처리 로직은 기존과 동일 ... */
        document.getElementById('dropzone').classList.add('hidden');
        document.getElementById('file-info').classList.remove('hidden');
        document.getElementById('file-name').innerText = file.name;
        document.getElementById('file-meta').innerText = `크기: ${(file.size / 1024).toFixed(1)} KB | 시트 수: ${sheetNames.length}`;

        const sel = document.getElementById('sheet-select');
        sel.innerHTML = sheetNames.map(s => `<option value="${s}">${s}</option>`).join('');

        renderFormatCards();
        document.getElementById('format-area').classList.remove('hidden');

    } catch (err) {
        console.error("파일 처리 에러:", err);
        showToast('엑셀 파일을 읽는 데 실패했습니다.', true);
    }
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
function renderRawPreview() {
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
function parseData() {
    if (!ST.wb || !ST.fmtId) return;
    try {
        const sheetName = document.getElementById('sheet-select').value;
        const parser = new GradeDataParser(SCHEMAS[ST.fmtId]);
        ST.data = parser.parse(ST.wb, sheetName);

        showToast(`${ST.data.length}명의 데이터를 파싱했습니다.`);
        document.getElementById('badge-text').innerText = `${ST.data.length}명 로드됨`;
        document.getElementById('data-badge').querySelector('span').className = 'w-2 h-2 rounded-full bg-green-500';

        renderReport();
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

// ★ 변경: 내보내기가 비동기 버퍼 쓰기를 요구하므로 async 추가
async function exportTo(formatId) {
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
function loadSampleData() {
    const dummy = [];

    // 무작위 이름 생성을 위한 성/이름 배열
    const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'];
    const firstNames = ['서준', '하준', '도윤', '시우', '민준', '지호', '예준', '주원', '건우', '우진', '지안', '수아', '서윤', '서연', '하윤', '지우', '하은', '민서', '윤서', '채원', '도현', '준서', '민재', '현우', '승우', '지민', '수현', '지원', '다은', '은지'];

    const subjectsKor = ['화법과 작문', '언어와 매체'];
    const subjectsMath = ['확률과 통계', '미적분', '기하'];
    const subjectsInq = ['생활과 윤리', '윤리와 사상', '한국지리', '세계지리', '동아시아사', '세계사', '경제', '정치와 법', '사회·문화', '물리학I', '화학I', '생명과학I', '지구과학I'];

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

        dummy.push({
            grade_year: '3',
            class: cls,
            number: '0', // 정렬 후 재할당
            name: name,
            korean: {
                subject: subjectsKor[Math.floor(Math.random() * subjectsKor.length)],
                raw: korRaw,
                std: Math.floor(korRaw * 0.8 + 50),
                pct: Math.floor((korRaw / 100) * 100),
                grade: getGrade(korRaw, 100)
            },
            math: {
                subject: subjectsMath[Math.floor(Math.random() * subjectsMath.length)],
                raw: mathRaw,
                std: Math.floor(mathRaw * 0.9 + 40),
                pct: Math.floor((mathRaw / 100) * 100),
                grade: getGrade(mathRaw, 100)
            },
            english: {
                raw: engRaw,
                grade: getGrade(engRaw, 100)
            },
            inquiry1: {
                subject: subjectsInq[Math.floor(Math.random() * subjectsInq.length)],
                raw: inq1Raw,
                std: Math.floor(inq1Raw * 1.2 + 20),
                pct: Math.floor((inq1Raw / 50) * 100),
                grade: getGrade(inq1Raw, 50)
            },
            inquiry2: {
                subject: subjectsInq[Math.floor(Math.random() * subjectsInq.length)],
                raw: inq2Raw,
                std: Math.floor(inq2Raw * 1.2 + 20),
                pct: Math.floor((inq2Raw / 50) * 100),
                grade: getGrade(inq2Raw, 50)
            },
            hist: {
                raw: histRaw,
                grade: getGrade(histRaw, 50)
            }
        });
    }

    // 반, 이름 순으로 정렬 후 번호 1번부터 예쁘게 재할당
    dummy.sort((a, b) => {
        if (a.class !== b.class) return parseInt(a.class) - parseInt(b.class);
        return a.name.localeCompare(b.name);
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