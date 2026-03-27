/* ───────────────────────────────────────────
   § 선택과목 비율 분석
─────────────────────────────────────────── */
function renderSubjectSelection(cache) {
    if (!ST.data || ST.data.length === 0) return;
    if (!ST.charts) ST.charts = {};

    // ★ aggregate() 호출 제거 — 캐시에서 직접 사용
    const korStats = cache.korSubjectStats;
    const mathStats = cache.mathSubjectStats;
    const inqStats = cache.inqSubjectStats;

    const drawChart = (canvasId, statsId, statsData, chartKey, type) => {
        const canvasEl = document.getElementById(canvasId);
        const statsContainer = document.getElementById(statsId);
        if (!canvasEl || !statsContainer) return;

        // ★ globalReportBasis 대신 cache.basis 사용
        const basisLabel = labelMap[cache.basis];
        const labels = Object.keys(statsData)
            // [핵심 수정] 빈 문자열, null, undefined, '미응시' 등 결측 데이터 라벨을 완전히 제외
            .filter(key => key && key.trim() !== '' && key !== 'null' && key !== 'undefined' && key !== '미응시')
            .sort((a, b) => statsData[b].count - statsData[a].count);

        if (ST.charts[chartKey]) {
            ST.charts[chartKey].destroy();
            delete ST.charts[chartKey];
        }

        if (labels.length === 0) {
            statsContainer.innerHTML =
                '<p class="text-center text-slate-400 mt-4 text-base font-medium">데이터가 없습니다.</p>';
            return;
        }

        const counts = labels.map(l => statsData[l].count);
        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#14b8a6', '#64748b', '#0ea5e9', '#d946ef'
        ];

        ST.charts[chartKey] = new Chart(canvasEl.getContext('2d'), {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: counts,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {padding: {top: 0, bottom: 0, left: 0, right: 0}},
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {boxWidth: 12, padding: 8, font: {size: 11}}
                    }
                }
            }
        });

        const total = counts.reduce((a, b) => a + b, 0);
        let html = `
        <table class="w-full text-center mt-1 border-t border-slate-100 pt-0 text-base">
            <thead>
                <tr class="text-slate-500 font-semibold border-b border-slate-100 bg-slate-50">
                    <th class="py-2 rounded-tl-lg">과목명</th>
                    <th class="py-2">비율 (인원)</th>
                    <th class="py-2">평균 ${basisLabel}</th>
                    <th class="py-2 rounded-tr-lg">평균 등급</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
        `;

        labels.forEach(l => {
            const d = statsData[l];
            const pct = ((d.count / total) * 100).toFixed(1);
            const avgRaw = d.validRawCount > 0 ? (d.sumRaw / d.validRawCount).toFixed(1) : '-';
            const avgGrade = d.validGradeCount > 0 ? (d.sumGrade / d.validGradeCount).toFixed(1) : '-';
            html += `
            <tr class="hover:bg-blue-50 transition-colors cursor-pointer group"
                onclick="showSelectedSubjectStudents('${type}', '${l}')">
                <td class="py-2 font-medium text-slate-700 group-hover:text-blue-600">${l}</td>
                <td class="py-2 text-slate-600">${pct}% <span class="text-base text-slate-400">(${d.count})</span></td>
                <td class="py-2 text-blue-600 font-semibold">${avgRaw}</td>
                <td class="py-2 text-emerald-600 font-semibold">${avgGrade}</td>
            </tr>
            `;
        });

        html += `</tbody></table>`;
        statsContainer.innerHTML = html;
    };

    drawChart('kor-select-chart', 'kor-select-stats', korStats, 'korSelectPie', 'kor');
    drawChart('math-select-chart', 'math-select-stats', mathStats, 'mathSelectPie', 'math');
    drawChart('inq-select-chart', 'inq-select-stats', inqStats, 'inqSelectPie', 'inq');
}