import Chart from 'chart.js/auto';
import {ST} from '../main.js';
import {labelMap} from '../report.js';
/* 아래 마크업의 on* 속성이 부르는 함수는 모듈 스코프가 아니라 전역에서 찾는다.
 * src/main.js가 window에 올려두므로 여기서 import 하지 않는다. */
import {DASH, escapeAttr, toFixedHalfUp} from '../utils.js';

/* ───────────────────────────────────────────
   § 선택과목 비율 분석
─────────────────────────────────────────── */

/* 파이 조각 안에 과목명과 비율을 적는다(text-base 크기).
 * 조각 바깥쪽(반지름의 2/3)에 적고, 그 자리의 조각 폭에 맞는 글만 적는다:
 * 과목명까지 들어가면 둘 다, 비율만 들어가면 비율만, 그것도 안 되면 적지 않는다(범례와 표에 있다) */
const NAME_FONT = '600 16px Pretendard, sans-serif';
const PCT_FONT = '500 14px Pretendard, sans-serif';
const sliceLabels = {
    id: 'sliceLabels',
    afterDatasetsDraw(chart) {
        const {ctx} = chart;
        const data = chart.data.datasets[0].data;
        const total = data.reduce((a, b) => a + b, 0);
        if (!total) return;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
            if (!chart.getDataVisibility(i) || !data[i]) return;
            const {x, y, startAngle, endAngle, outerRadius} = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'outerRadius'], true);
            const mid = (startAngle + endAngle) / 2;
            const r = outerRadius * 0.66;
            // 그 반지름에서 조각이 가로로 차지하는 폭(현의 길이). 한 조각이 반을 넘으면 넉넉하다
            const room = endAngle - startAngle >= Math.PI ? Infinity : 2 * r * Math.sin((endAngle - startAngle) / 2);
            const cx = x + Math.cos(mid) * r;
            const cy = y + Math.sin(mid) * r;
            const name = String(chart.data.labels[i]);
            const pct = `${toFixedHalfUp(data[i] / total * 100, 1)}%`;
            ctx.font = NAME_FONT;
            const nameW = ctx.measureText(name).width;
            ctx.font = PCT_FONT;
            const pctW = ctx.measureText(pct).width;
            if (Math.max(nameW, pctW) + 8 <= room && room >= 40) {
                ctx.font = NAME_FONT;
                ctx.fillText(name, cx, cy - 10);
                ctx.font = PCT_FONT;
                ctx.fillText(pct, cx, cy + 10);
            } else if (pctW + 6 <= room) {
                ctx.font = PCT_FONT;
                ctx.fillText(pct, cx, cy);
            }
        });
        ctx.restore();
    },
};

export function renderSubjectSelection(cache) {
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
            // 1. 빈 문자열, null, undefined, '미응시' 등 쓰레기 라벨을 완전히 제외
            .filter(key => key && key.trim() !== '' && key !== 'null' && key !== 'undefined' && key !== '미응시')
            // 2. count 값이 누락되거나 비정상적이어도 NaN이 발생하지 않도록 방어
            .sort((a, b) => {
                const countA = Number(statsData[a].count) || 0;
                const countB = Number(statsData[b].count) || 0;
                return countB - countA;
            });

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
        // 탐구는 과목이 10개를 넘기 쉽다. 색이 모자라면 Chart.js 기본 회색이 칠해지므로
        // 20색을 두고, 그보다 많으면 처음부터 다시 쓴다.
        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#14b8a6', '#64748b', '#0ea5e9', '#d946ef',
            '#84cc16', '#f97316', '#6366f1', '#06b6d4', '#eab308',
            '#1e3a8a', '#92400e', '#166534', '#9f1239', '#334155'
        ];

        ST.charts[chartKey] = new Chart(canvasEl.getContext('2d'), {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: counts,
                    backgroundColor: labels.map((_, i) => colors[i % colors.length]),
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
                        labels: {boxWidth: 12, padding: 8, font: {size: 13}}
                    }
                }
            },
            plugins: [sliceLabels],
        });

        const total = counts.reduce((a, b) => a + b, 0);

        // basis에 따라 평균 컬럼 계산 방식 결정
        const getAvgScore = (d) => {
            if (cache.basis === 'std') {
                return d.validStdCount > 0 ? toFixedHalfUp(d.sumStd / d.validStdCount, 1) : DASH;
            } else if (cache.basis === 'pct') {
                return d.validPctCount > 0 ? toFixedHalfUp(d.sumPct / d.validPctCount, 1) : DASH;
            } else {
                return d.validRawCount > 0 ? toFixedHalfUp(d.sumRaw / d.validRawCount, 1) : DASH;
            }
        };

        let html = `
        <div class="overflow-x-auto"><table class="w-full min-w-[22rem] whitespace-nowrap text-center mt-1 border-t border-slate-100 pt-0 text-base">
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
            const pct = toFixedHalfUp((d.count / total) * 100, 1);
            const avgScore = getAvgScore(d);
            const avgGrade = d.validGradeCount > 0 ? toFixedHalfUp(d.sumGrade / d.validGradeCount, 1) : DASH;
            html += `
            <tr class="hover:bg-blue-50 transition-colors cursor-pointer group"
                data-type="${escapeAttr(type)}" data-subject="${escapeAttr(l)}"
                data-action="subject-students">
                <td class="py-2 font-medium text-slate-700 group-hover:text-blue-600">${escapeAttr(l)}</td>
                <td class="py-2 text-slate-600">${pct}% <span class="text-base text-slate-400">(${d.count})</span></td>
                <td class="py-2 text-blue-600 font-semibold">${avgScore}</td>
                <td class="py-2 text-emerald-600 font-semibold">${avgGrade}</td>
            </tr>
            `;
        });

        html += `</tbody></table></div>`;
        statsContainer.innerHTML = html;
    };

    drawChart('kor-select-chart', 'kor-select-stats', korStats, 'korSelectPie', 'kor');
    drawChart('math-select-chart', 'math-select-stats', mathStats, 'mathSelectPie', 'math');
    drawChart('inq-select-chart', 'inq-select-stats', inqStats, 'inqSelectPie', 'inq');
}