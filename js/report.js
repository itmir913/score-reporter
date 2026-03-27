// ★ 전역 상태: 현재 통계 기준 (raw: 원점수, std: 표준점수)
let globalReportBasis = 'raw';
const labelMap = {'raw': '원점수', 'std': '표준점수', 'pct': '백분위'};

/* ───────────────────────────────────────────
   § 통계 기준 설정 및 UI 업데이트
─────────────────────────────────────────── */
function setGlobalBasis(basis) {
    globalReportBasis = basis;

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

    const dateStr = `분석 일시: ${new Date().toLocaleString()}`;
    if (document.getElementById('print-date-top')) {
        document.getElementById('print-date-top').innerText = dateStr;
    }

    renderAll();
}

/* ───────────────────────────────────────────
   § 모든 렌더링 함수
─────────────────────────────────────────── */
function renderAll() {
    // ★ ST.data를 단 한 번만 순회하여 공용 캐시 생성
    const cache = computeRenderCache(ST.data, globalReportBasis);
    ST.cache = cache;  // 필요 시 외부 참조용

    renderStats(cache);
    renderTopN(cache);
    renderScoreDistribution();       // 캐시 미적용
    renderSubjectSelection(cache);
    renderSubjectsCharts();                  // chartBasis가 별도 선택값 → 캐시 미사용
    renderCsatMinRequirement(cache);
}

/* ───────────────────────────────────────────
   § 리사이즈 디바운스
─────────────────────────────────────────── */
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const reportContent = document.getElementById('report-content');
        if (reportContent && !reportContent.classList.contains('hidden')) {
            renderAll();
        }
    }, 1000);
});