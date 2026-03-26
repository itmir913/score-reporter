/* ───────────────────────────────────────────
   § 점수합 급간별 인원 분포 (전역 기준 적용 및 가로 표 추가)
─────────────────────────────────────────── */
function renderScoreDistribution(cache) {
    const intervalSize = parseInt(document.getElementById('interval-size').value, 10);
    const basisLabel   = labelMap[cache.basis];

    document.getElementById('dist-title').innerText =
        `${basisLabel} 합(국어+수학+탐구1+탐구2) 급간별 인원 분포`;

    // ★ 캐시에서 4과목 합산 값 활용 — ST.data 재순회 없음
    const sums = cache.studentWithSums
        .map(item => item.sum)
        .filter(sum => sum > 0);

    if (sums.length === 0) return;

    const maxScore = Math.max(...sums);
    const numBins  = Math.floor(maxScore / intervalSize) + 1;

    const labels = [];
    const counts = [];

    for (let i = numBins - 1; i >= 0; i--) {
        const min = i * intervalSize;
        const max = min + intervalSize - 1;
        labels.push(`${min}~${max}`);
        counts.push(0);
    }

    sums.forEach(score => {
        let binIndex = Math.floor(score / intervalSize);
        if (binIndex >= numBins) binIndex = numBins - 1;
        counts[(numBins - 1) - binIndex]++;
    });

    // --- 차트 그리기 ---
    const canvasId = 'score-dist-chart';
    if (ST.charts['scoreDist']) ST.charts['scoreDist'].destroy();

    ST.charts['scoreDist'] = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '인원(명)',
                data: counts,
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: '#059669',
                borderWidth: 1,
                borderRadius: {topLeft: 4, topRight: 4},
                categoryPercentage: 1.0,
                barPercentage: 0.95
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            onClick: function (event, elements) {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const label = `${this.data.labels[index]} 급간`;

                    const range = label.split('~').map(v => parseFloat(v.trim()));
                    const min   = range[0];
                    const max   = range.length > 1 ? range[1] : min;

                    const basis = globalReportBasis;
                    const studentsInBin = ST.data.filter(s => {
                        let sum = 0;
                        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
                            if (s[subj] && typeof s[subj][basis] === 'number') sum += s[subj][basis];
                        });
                        const totalSum = Math.round(sum);
                        return totalSum >= min && totalSum <= max;
                    });

                    showBinStudentsModal(label, studentsInBin);
                }
            },
            onHover: (event, elements) => {
                event.native.target.style.cursor =
                    (elements && elements.length > 0) ? 'pointer' : 'default';
            },
            plugins: {
                legend: {display: false},
                tooltip: {
                    callbacks: {
                        title: (ctx) => `${ctx[0].label}점 구간`,
                        label: (ctx) => ` ${ctx.raw}명`
                    }
                }
            },
            scales: {
                y: {beginAtZero: true, ticks: {stepSize: 1}},
                x: {grid: {display: false}}
            }
        }
    });

    // --- 표 렌더링 ---
    const thead = document.getElementById('score-dist-thead');
    const tbody = document.getElementById('score-dist-tbody');
    thead.innerHTML = '';

    const chunkSize = 8;
    let tableHtml   = '';

    for (let i = 0; i < labels.length; i += chunkSize) {
        const chunkLabels = labels.slice(i, i + chunkSize);
        const chunkCounts = counts.slice(i, i + chunkSize);
        const emptyCells  = Array(chunkSize - chunkLabels.length)
            .fill('<td class="px-1 py-2"></td>').join('');

        tableHtml += `
        <tr class="bg-slate-100 text-slate-700 font-bold border-t-2 border-slate-200">
            <td class="px-1 py-3 text-center border-r border-slate-200 w-[14%] text-base md:text-base">점수 급간</td>
            ${chunkLabels.map(label =>
            `<td class="px-1 py-3 text-center text-[10px] sm:text-base md:text-base tracking-tighter">${label}</td>`
        ).join('')}
            ${emptyCells}
        </tr>
        <tr class="bg-white border-b border-slate-200">
            <td class="px-1 py-3 text-center font-bold text-slate-700 border-r border-slate-200 text-base md:text-base">인원 (명)</td>
            ${chunkCounts.map(c =>
            `<td class="px-1 py-3 text-center text-base md:text-base text-slate-600 ${c > 0 ? 'font-black text-emerald-600' : ''}">${c}</td>`
        ).join('')}
            ${emptyCells}
        </tr>
        `;
    }

    tbody.innerHTML = tableHtml;
}