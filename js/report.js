/* ───────────────────────────────────────────
   § 보고서 생성 로직
─────────────────────────────────────────── */
function renderReport() {
    const wrap = document.getElementById('report-content');
    const empty = document.getElementById('report-empty');
    if (!ST.data || ST.data.length === 0) {
        wrap.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');

    document.getElementById('report-subtitle').innerText = `총 ${ST.data.length}명 분석 완료`;
    document.getElementById('print-title').innerText = '성적 분석 보고서';
    document.getElementById('print-date').innerText = `출력일시: ${new Date().toLocaleString()}`;

    // 통계 렌더링
    renderStats();
    // Top 20 렌더링
    renderTop20();
    // 차트 렌더링
    renderCharts();
}

function renderStats() {
    const d = ST.data;
    const total = d.length;

    const korAvg = fmt(avgOf(d.map(s => s.korean.std)));
    const mathAvg = fmt(avgOf(d.map(s => s.math.std)));
    const engGradeAvg = fmt(avgOf(d.map(s => s.english.grade)));

    document.getElementById('stat-cards').innerHTML = `
            <div class="stat-card bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                <span class="text-base text-slate-400 font-bold mb-1 uppercase tracking-wide">총 응시 인원</span>
                <span class="text-2xl font-black text-slate-800">${total}명</span>
            </div>
            <div class="stat-card bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                <span class="text-base text-slate-400 font-bold mb-1 uppercase tracking-wide">국어 표준점수 평균</span>
                <span class="text-2xl font-black text-blue-600">${korAvg}점</span>
            </div>
            <div class="stat-card bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                <span class="text-base text-slate-400 font-bold mb-1 uppercase tracking-wide">수학 표준점수 평균</span>
                <span class="text-2xl font-black text-emerald-600">${mathAvg}점</span>
            </div>
            <div class="stat-card bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-center">
                <span class="text-base text-slate-400 font-bold mb-1 uppercase tracking-wide">영어 등급 평균</span>
                <span class="text-2xl font-black text-violet-600">${engGradeAvg}등급</span>
            </div>
        `;
}

function renderTop20() {
    const ranked = [...ST.data].map(s => {
        const sum = (s.korean.std || 0) + (s.math.std || 0) + (s.inquiry1.std || 0) + (s.inquiry2.std || 0);
        return {...s, sumStd: sum};
    }).sort((a, b) => b.sumStd - a.sumStd).slice(0, 20);

    document.getElementById('top20-thead').innerHTML = `
            <tr>
                <th class="px-4 py-2 text-left">석차</th>
                <th class="px-4 py-2 text-left">이름</th>
                <th class="px-4 py-2 text-center">총점(표)</th>
                <th class="px-4 py-2 text-center">국어(표)</th>
                <th class="px-4 py-2 text-center">수학(표)</th>
                <th class="px-4 py-2 text-center">영어(등)</th>
                <th class="px-4 py-2 text-center">탐구1(표)</th>
                <th class="px-4 py-2 text-center">탐구2(표)</th>
            </tr>
        `;
    document.getElementById('top20-tbody').innerHTML = ranked.map((s, idx) => `
            <tr>
                <td class="px-4 py-2 font-bold text-slate-800">${idx + 1}</td>
                <td class="px-4 py-2 font-semibold">${s.name}</td>
                <td class="px-4 py-2 text-center font-bold text-blue-600">${s.sumStd}</td>
                <td class="px-4 py-2 text-center">${s.korean.std ?? '-'}</td>
                <td class="px-4 py-2 text-center">${s.math.std ?? '-'}</td>
                <td class="px-4 py-2 text-center"><span class="gb gb-${s.english.grade || 9}">${s.english.grade ?? '-'}</span></td>
                <td class="px-4 py-2 text-center">${s.inquiry1.std ?? '-'}</td>
                <td class="px-4 py-2 text-center">${s.inquiry2.std ?? '-'}</td>
            </tr>
        `).join('');
}

function renderCharts() {
    const grid = document.getElementById('chart-grid');
    grid.innerHTML = '';

    Object.values(ST.charts).forEach(c => c.destroy());
    ST.charts = {};

    const chartConfigs = [
        {label: '국어', key: s => s.korean.grade, color: 'rgba(37, 99, 235, 0.5)', border: '#2563eb', subjKey: 'kor'},
        {label: '수학', key: s => s.math.grade, color: 'rgba(16, 185, 129, 0.5)', border: '#10b981', subjKey: 'math'},
        {label: '영어', key: s => s.english.grade, color: 'rgba(139, 92, 246, 0.5)', border: '#8b5cf6', subjKey: 'eng'}
    ];

    chartConfigs.forEach(cfg => {
        const counts = Array(9).fill(0);
        ST.data.forEach(s => {
            const g = cfg.key(s);
            if (g >= 1 && g <= 9) counts[g - 1]++;
        });

        if (counts.every(c => c === 0)) return;

        const id = `chart-${cfg.subjKey}`;
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 rounded-2xl p-4';
        div.innerHTML = `<p class="text-base font-bold text-slate-600 mb-2.5">${cfg.label} 등급 분포</p>
                             <div class="relative h-44"><canvas id="${id}"></canvas></div>`;
        grid.appendChild(div);

        ST.charts[cfg.subjKey] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
                datasets: [{
                    label: '인원(명)', data: counts,
                    backgroundColor: cfg.color, borderColor: cfg.border,
                    borderWidth: 1, borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {legend: {display: false}},
                scales: {
                    y: {beginAtZero: true, ticks: {stepSize: 1, font: {size: 10}}, grid: {color: '#f1f5f9'}},
                    x: {grid: {display: false}, ticks: {font: {size: 10}}}
                }
            }
        });
    });
}
