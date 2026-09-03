import Chart from 'chart.js/auto';
import {ST} from '../main.js';
import {labelMap} from '../report.js';
import {showBinStudentsModal} from './report-modal.js';

/* ───────────────────────────────────────────
   § 점수합 급간별 인원 분포 (전역 기준 적용 및 가로 표 추가)
─────────────────────────────────────────── */
export function renderScoreDistribution(cache = ST.cache) {
    if (!cache) return;
    const intervalSize = parseInt(document.getElementById('interval-size').value, 10);
    const basisLabel = labelMap[cache.basis];

    document.getElementById('dist-title').innerText =
        `${basisLabel} 합(국어+수학+탐구1+탐구2) 급간별 인원 분포`;

    // ★ 캐시의 studentWithSums 재사용 — ST.data 재순회 없음
    // cache.basis 기준 합산이 이미 되어 있으므로 합산 기준도 상위 N명 테이블과 완전히 일치
    const sums = cache.studentWithSums
        .map(({sum}) => sum)
        .filter(sum => Number.isFinite(sum) && sum >= 0);

    if (sums.length === 0) return;

    const maxScore = Math.max(...sums);
    const numBins = Math.floor(maxScore / intervalSize) + 1;

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

                    // 히스토그램 빈 구성과 동일한 기준으로 필터 (Math.floor + 캐시 합산)
                    const studentsInBin = cache.studentWithSums
                        .filter(({sum}) => Number.isFinite(sum) && sum >= 0
                            && Math.floor(sum / intervalSize) === numBins - 1 - index)
                        .map(({s}) => s);

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
    let tableHtml = '';

    for (let i = 0; i < labels.length; i += chunkSize) {
        const chunkLabels = labels.slice(i, i + chunkSize);
        const chunkCounts = counts.slice(i, i + chunkSize);
        const emptyCells = Array(chunkSize - chunkLabels.length)
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