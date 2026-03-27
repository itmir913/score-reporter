/* ───────────────────────────────────────────
   § 요약 통계 (과목별 고유 컬러 및 지표명 적용)
─────────────────────────────────────────── */
function renderStats(cache) {
    const total = ST.data.length;
    if (total === 0) return;

    const basis = cache.basis;
    const basisLabel = labelMap[basis]; // '원점수', '표준점수', '백분위'
    const unit = basis === 'pct' ? '%' : '점';

    // 1. 국어/수학 상위 20% 평균 계산
    const top20Count = Math.max(1, Math.ceil(total * 0.2));
    const korTop20Avg = (([...cache.korScores].sort((a, b) => b - a).slice(0, top20Count).reduce((a, b) => a + b, 0)) / top20Count).toFixed(1);
    const mathTop20Avg = (([...cache.mathScores].sort((a, b) => b - a).slice(0, top20Count).reduce((a, b) => a + b, 0)) / top20Count).toFixed(1);

    // 2. 영어 상위 20% 평균 등급 계산
    const engTop20 = [...cache.engGrades].sort((a, b) => a - b).slice(0, top20Count);
    const engTop20Avg = (engTop20.reduce((a, b) => a + b, 0) / top20Count).toFixed(1);

    // 3. HTML 렌더링
    document.getElementById('stat-cards').innerHTML = `
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-tight">총 응시 인원</span>
            <span class="text-3xl font-black text-slate-800">${total}<span class="text-lg font-normal ml-0.5">명</span></span>
        </div>
        
        <div class="stat-card bg-white border border-slate-200 border-b-4 border-b-blue-500 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-blue-600 font-bold mb-1 uppercase tracking-tight">국어 상위 20% ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-blue-700">${korTop20Avg}<span class="text-lg font-normal ml-0.5">${unit}</span></span>
        </div>

        <div class="stat-card bg-white border border-slate-200 border-b-4 border-b-amber-400 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-amber-600 font-bold mb-1 uppercase tracking-tight">수학 상위 20% ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-amber-600">${mathTop20Avg}<span class="text-lg font-normal ml-0.5">${unit}</span></span>
        </div>

        <div class="stat-card bg-white border border-slate-200 border-b-4 border-b-rose-500 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-rose-600 font-bold mb-1 uppercase tracking-tight">영어 상위 20% 등급</span>
            <span class="text-3xl font-black text-rose-700">${engTop20Avg}<span class="text-lg font-normal ml-0.5">등급</span></span>
        </div>
    `;
}