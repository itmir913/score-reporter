/* ───────────────────────────────────────────
   § 요약 통계
─────────────────────────────────────────── */
function renderStats(cache) {
    const total      = ST.data.length;
    const basisLabel = labelMap[cache.basis];

    // ★ 캐시에서 점수 배열 직접 사용 — ST.data 재순회 없음
    const korAvg      = fmt(avgOf(cache.korScores));
    const mathAvg     = fmt(avgOf(cache.mathScores));
    const engGradeAvg = fmt(avgOf(cache.engGrades));

    document.getElementById('stat-cards').innerHTML = `
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">총 응시 인원</span>
            <span class="text-3xl font-black text-slate-800">${total}명</span>
        </div>
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">국어 ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-blue-600">${korAvg}</span>
        </div>
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">수학 ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-emerald-600">${mathAvg}</span>
        </div>
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">영어 등급 평균</span>
            <span class="text-3xl font-black text-violet-600">${engGradeAvg}등급</span>
        </div>
    `;
}