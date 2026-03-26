/* ───────────────────────────────────────────
   § 선택과목 비율 분석
─────────────────────────────────────────── */
function renderSubjectSelection() {
    if (!ST.data || ST.data.length === 0) return;
    if (!ST.charts) ST.charts = {};

    const aggregate = (getSubject, getScore) => {
        const stats = {};
        ST.data.forEach(student => {
            const subjects = [].concat(getSubject(student));
            const scoreObjs = [].concat(getScore(student));

            subjects.forEach((sub, idx) => {
                if (!sub || typeof sub !== 'string' || sub.trim() === '') return;

                if (!stats[sub]) {
                    stats[sub] = {count: 0, sumRaw: 0, validRawCount: 0, sumGrade: 0, validGradeCount: 0};
                }

                const scoreObj = scoreObjs[idx];
                stats[sub].count += 1;

                if (scoreObj) {
                    let rawScore = 0;
                    let hasRaw = false;
                    if (typeof scoreObj.common_raw === 'number' || typeof scoreObj.select_raw === 'number') {
                        rawScore = (scoreObj.common_raw || 0) + (scoreObj.select_raw || 0);
                        hasRaw = true;
                    } else if (typeof scoreObj.raw === 'number') {
                        rawScore = scoreObj.raw;
                        hasRaw = true;
                    }
                    if (hasRaw) {
                        stats[sub].sumRaw += rawScore;
                        stats[sub].validRawCount += 1;
                    }
                    if (typeof scoreObj.grade === 'number') {
                        stats[sub].sumGrade += scoreObj.grade;
                        stats[sub].validGradeCount += 1;
                    }
                }
            });
        });
        return stats;
    };

    const korStats = aggregate(s => s.korean?.subject, s => s.korean);
    const mathStats = aggregate(s => s.math?.subject, s => s.math);
    const inqStats = aggregate(
        s => [s.inquiry1?.subject, s.inquiry2?.subject],
        s => [s.inquiry1, s.inquiry2]
    );

    // ★ 함수 정의 순서 수정: (canvasId, statsId, statsData, chartKey, type)
    const drawChart = (canvasId, statsId, statsData, chartKey, type) => {
        const canvasEl = document.getElementById(canvasId);
        const statsContainer = document.getElementById(statsId);

        if (!canvasEl || !statsContainer) return;

        const basis = globalReportBasis;
        const basisLabel = labelMap[basis];
        const labels = Object.keys(statsData).sort((a, b) => statsData[b].count - statsData[a].count);

        if (ST.charts[chartKey]) {
            ST.charts[chartKey].destroy();
            delete ST.charts[chartKey];
        }

        if (labels.length === 0) {
            statsContainer.innerHTML = '<p class="text-center text-slate-400 mt-4 text-sm font-medium">데이터가 없습니다.</p>';
            return;
        }

        const counts = labels.map(l => statsData[l].count);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#0ea5e9', '#d946ef'];

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
                // [수정] 차트 자체의 외곽 여백 제거
                layout: {
                    padding: {
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            padding: 8, // [수정] 범례 주변 패딩 축소 (15 -> 8)
                            font: {size: 11}
                        }
                    }
                }
            }
        });

        const total = counts.reduce((a, b) => a + b, 0);
        // [수정] mt-4 제거, pt-2 제거 -> mt-1 정도로 밀착
        let html = `
        <table class="w-full text-center mt-1 border-t border-slate-100 pt-0 text-sm">
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
                <td class="py-2 text-slate-600">${pct}% <span class="text-xs text-slate-400">(${d.count})</span></td>
                <td class="py-2 text-blue-600 font-semibold">${avgRaw}</td>
                <td class="py-2 text-emerald-600 font-semibold">${avgGrade}</td>
            </tr>
        `;
        });
        html += `</tbody></table>`;
        statsContainer.innerHTML = html;
    };

    // ★ 호출부 순서 수정: (canvasId, statsId, statsData, chartKey, type)
    drawChart('kor-select-chart', 'kor-select-stats', korStats, 'korSelectPie', 'kor');
    drawChart('math-select-chart', 'math-select-stats', mathStats, 'mathSelectPie', 'math');
    drawChart('inq-select-chart', 'inq-select-stats', inqStats, 'inqSelectPie', 'inq');
}