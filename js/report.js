// ★ 전역 상태: 현재 통계 기준 (raw: 원점수, std: 표준점수)
let globalReportBasis = 'raw';
const labelMap = {'raw': '원점수', 'std': '표준점수', 'pct': '백분위'};

/* ───────────────────────────────────────────
   § 통계 기준 설정 및 UI 업데이트
─────────────────────────────────────────── */
function setGlobalBasis(basis) {
    globalReportBasis = basis;

    // 모든 버튼의 활성화 스타일 초기화
    const buttons = {
        raw: document.getElementById('btn-basis-raw'),
        std: document.getElementById('btn-basis-std'),
        pct: document.getElementById('btn-basis-pct')
    };

    Object.keys(buttons).forEach(key => {
        if (key === basis) {
            buttons[key].className = 'px-4 py-2 text-base font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all';
        } else {
            buttons[key].className = 'px-4 py-2 text-base font-medium rounded-md text-slate-500 hover:text-slate-700 transition-all';
        }
    });

    renderAll();
}

/* ───────────────────────────────────────────
   § 보고서 생성 로직
─────────────────────────────────────────── */
function renderReport() {
    const wrap = document.getElementById('report-content');
    const empty = document.getElementById('report-empty');
    if (!ST.data || ST.data.length === 0) {
        wrap.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');

    document.getElementById('report-subtitle').innerText = `총 ${ST.data.length}명 분석 완료`;

    // ★ 추가: 새 헤더 날짜 업데이트
    const dateStr = `분석 일시: ${new Date().toLocaleString()}`;
    if (document.getElementById('print-date-top')) {
        document.getElementById('print-date-top').innerText = dateStr;
    }

    // 모든 섹션 렌더링
    renderAll();
}

/* ───────────────────────────────────────────
   § 모든 렌더링 함수
─────────────────────────────────────────── */
function renderAll() {
    renderStats();
    renderTopN();
    renderScoreDistribution();
    renderSubjectSelection();
    renderCharts();
    renderCsatMinRequirement();
}

/* ───────────────────────────────────────────
   § 디바운스(Debounce)를 적용하여 리사이즈 이벤트가 너무 자주 발생하는 것을 방지합니다.
─────────────────────────────────────────── */
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        // 보고서 탭이 활성화되어 있을 때만 다시 그립니다.
        const reportContent = document.getElementById('report-content');
        if (reportContent && !reportContent.classList.contains('hidden')) {
            renderAll();
        }
    }, 1000); // 1.0초 대기 후 실행
});