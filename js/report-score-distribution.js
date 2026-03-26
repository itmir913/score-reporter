/* ───────────────────────────────────────────
   § 점수합 급간별 인원 분포 (전역 기준 적용 및 가로 표 추가)
─────────────────────────────────────────── */
function renderScoreDistribution() {
    const intervalSize = parseInt(document.getElementById('interval-size').value, 10);
    const basis = globalReportBasis;
    const basisLabel = labelMap[basis];

    document.getElementById('dist-title').innerText = `${basisLabel} 합(국어+수학+탐구1+탐구2) 급간별 인원 분포`;

    const sums = ST.data.map(s => {
        let sum = 0;
        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
            if (s[subj] && typeof s[subj][basis] === 'number') sum += s[subj][basis];
        });
        return sum;
    }).filter(sum => sum > 0);

    if (sums.length === 0) return;

    const maxScore = Math.max(...sums);
    const numBins = Math.floor(maxScore / intervalSize) + 1;

    const labels = [];
    const counts = [];

    // 점수가 높은 급간부터 보여주도록 역순(내림차순)으로 생성
    for (let i = numBins - 1; i >= 0; i--) {
        const min = i * intervalSize;
        const max = min + intervalSize - 1;
        labels.push(`${min}~${max}`);
        counts.push(0);
    }

    // 인원 배치 (역순 배열에 맞춰 인덱스 계산)
    sums.forEach(score => {
        let binIndex = Math.floor(score / intervalSize);
        if (binIndex >= numBins) binIndex = numBins - 1;
        // 배열이 역순이므로 실제 저장 인덱스는 (numBins - 1 - binIndex)
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
            // ★ 중요: onClick은 options의 자식이 맞지만,
            // 일부 환경에서 인식이 안 될 경우를 대비해 인자 구성을 확인하세요.
            onClick: function (event, elements) {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const label = `${this.data.labels[index]} 급간`; // 'this'는 차트 객체를 가리킵니다.

                    const range = label.split('~').map(v => parseFloat(v.trim()));
                    const min = range[0];
                    const max = range.length > 1 ? range[1] : min;

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
            // 마우스 커서 변경 로직 (이것도 options 직계입니다)
            onHover: (event, elements) => {
                event.native.target.style.cursor = (elements && elements.length > 0) ? 'pointer' : 'default';
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

    // --- ★ 표 렌더링 (가로 방향, N개씩 줄바꿈) ---
    const thead = document.getElementById('score-dist-thead');
    const tbody = document.getElementById('score-dist-tbody');

    // thead는 비워두고 tbody 안에 여러 줄의 표를 렌더링합니다.
    thead.innerHTML = '';

    // --- (이전 코드 동일) ---
    const chunkSize = 8; // ★ 10에서 8로 변경 (A4 portrait 최적화)
    let tableHtml = '';

    for (let i = 0; i < labels.length; i += chunkSize) {
        const chunkLabels = labels.slice(i, i + chunkSize);
        const chunkCounts = counts.slice(i, i + chunkSize);

        const emptyCells = Array(chunkSize - chunkLabels.length).fill('<td class="px-1 py-2"></td>').join('');

        // 1. 점수 급간 행 (px-2 -> px-1, text-base 제거)
        tableHtml += `
        <tr class="bg-slate-100 text-slate-700 font-bold border-t-2 border-slate-200">
            <td class="px-1 py-3 text-center border-r border-slate-200 w-[14%] text-xs md:text-sm">점수 급간</td>
            ${chunkLabels.map(label => `<td class="px-1 py-3 text-center text-[10px] sm:text-xs md:text-sm tracking-tighter">${label}</td>`).join('')}
            ${emptyCells}
        </tr>
    `;

        // 2. 인원수 행
        tableHtml += `
        <tr class="bg-white border-b border-slate-200">
            <td class="px-1 py-3 text-center font-bold text-slate-700 border-r border-slate-200 text-xs md:text-sm">인원 (명)</td>
            ${chunkCounts.map(c => `<td class="px-1 py-3 text-center text-xs md:text-sm text-slate-600 ${c > 0 ? 'font-black text-emerald-600' : ''}">${c}</td>`).join('')}
            ${emptyCells}
        </tr>
    `;
    }

    tbody.innerHTML = tableHtml;
}