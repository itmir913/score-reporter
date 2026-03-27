/* ───────────────────────────────────────────
   § 요약 통계 (과목별 고유 컬러 및 지표명 적용)
─────────────────────────────────────────── */
function renderStats(cache) {
    const total = ST.data.length;
    if (total === 0) return;

    const basis = cache.basis;
    const basisLabel = labelMap[basis]; // '원점수', '표준점수', '백분위'
    const unit = basis === 'pct' ? '%' : '점';

    // Helper: 상위 20% 평균 계산 함수 (응시 인원 기준)
    const getTop20Avg = (scores, isLowerBetter = false) => {
        const count = scores.length;
        if (count === 0) return "0.0"; // 응시자 없을 경우 대비

        const topCount = Math.max(1, Math.ceil(count * 0.2));

        // 점수는 내림차순(b-a), 등급은 오름차순(a-b)
        const sorted = [...scores].sort((a, b) => isLowerBetter ? a - b : b - a);
        const topSlice = sorted.slice(0, topCount);
        const sum = topSlice.reduce((a, b) => a + b, 0);

        return (sum / topCount).toFixed(1);
    };

    // 각 과목별 실제 응시자 수 기준 상위 20% 계산
    const korTop20Avg = getTop20Avg(cache.korScores);
    const mathTop20Avg = getTop20Avg(cache.mathScores);
    const engTop20Avg = getTop20Avg(cache.engGrades, true); // 등급은 낮을수록 상위권

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