/* ───────────────────────────────────────────
   § 요약 통계
─────────────────────────────────────────── */
function renderStats() {
    const d = ST.data;
    const total = d.length;

    // ★ 추가됨: 현재 선택된 전역 기준(raw 또는 std) 가져오기
    const basis = globalReportBasis;
    const basisLabel = labelMap[basis];

    // ★ 수정됨: s.korean?.std 대신 s.korean?.[basis] 를 사용하여 동적으로 점수 가져오기
    const korAvg = fmt(avgOf(d.map(s => s.korean?.[basis])));
    const mathAvg = fmt(avgOf(d.map(s => s.math?.[basis])));
    const engGradeAvg = fmt(avgOf(d.map(s => s.english?.grade)));

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