// ★ 전역 상태: 현재 통계 기준 (raw: 원점수, std: 표준점수)
let globalReportBasis = 'raw';

/* ───────────────────────────────────────────
   § 통계 기준 설정 및 UI 업데이트
─────────────────────────────────────────── */
function setGlobalBasis(basis) {
    globalReportBasis = basis;

    // 버튼 스타일 업데이트
    const btnRaw = document.getElementById('btn-basis-raw');
    const btnStd = document.getElementById('btn-basis-std');

    if (basis === 'raw') {
        btnRaw.className = 'px-4 py-2 text-base font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all';
        btnStd.className = 'px-4 py-2 text-base font-medium rounded-md text-slate-500 hover:text-slate-700 transition-all';
    } else {
        btnStd.className = 'px-4 py-2 text-base font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all';
        btnRaw.className = 'px-4 py-2 text-base font-medium rounded-md text-slate-500 hover:text-slate-700 transition-all';
    }

    // 기준이 바뀌면 요약 통계도 다시 그립니다.
    renderStats();

    // 섹션 1, 2 다시 그리기 (섹션 3은 별도 지표를 따르므로 제외)
    renderTopN();
    renderScoreDistribution();
}

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

    // 모든 섹션 렌더링
    renderStats();
    renderTopN();
    renderScoreDistribution();
    renderCharts();
}

/* ───────────────────────────────────────────
   § 0. 요약 통계
─────────────────────────────────────────── */
function renderStats() {
    const d = ST.data;
    const total = d.length;

    // ★ 추가됨: 현재 선택된 전역 기준(raw 또는 std) 가져오기
    const basis = globalReportBasis;
    const basisLabel = basis === 'std' ? '표준점수' : '원점수';

    const fmt = (v) => isNaN(v) ? '-' : v.toFixed(1);
    const avgOf = (arr) => {
        const valid = arr.filter(v => typeof v === 'number');
        return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
    };

    // ★ 수정됨: s.korean?.std 대신 s.korean?.[basis] 를 사용하여 동적으로 점수 가져오기
    const korAvg = fmt(avgOf(d.map(s => s.korean?.[basis])));
    const mathAvg = fmt(avgOf(d.map(s => s.math?.[basis])));
    const engGradeAvg = fmt(avgOf(d.map(s => s.english?.grade)));

    document.getElementById('stat-cards').innerHTML = `
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">총 응시 인원</span>
            <span class="text-3xl font-black text-slate-800">${total}명</span>
        </div>
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">국어 ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-blue-600">${korAvg}점</span>
        </div>
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">수학 ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-emerald-600">${mathAvg}점</span>
        </div>
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-wide">영어 등급 평균</span>
            <span class="text-3xl font-black text-violet-600">${engGradeAvg}등급</span>
        </div>
    `;
}

/* ───────────────────────────────────────────
   § 1. 상위 N명 명단 렌더링 (전역 기준 적용)
─────────────────────────────────────────── */
function renderTopN() {
    const limit = parseInt(document.getElementById('top-n-count').value, 10);
    const basis = globalReportBasis;

    const getSum = (s, type) => {
        let sum = 0;
        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
            if (s[subj] && typeof s[subj][type] === 'number') {
                sum += s[subj][type];
            }
        });
        return sum;
    };

    const sortedData = [...ST.data].sort((a, b) => getSum(b, basis) - getSum(a, basis));
    const topData = sortedData.slice(0, limit);

    const basisLabel = basis === 'std' ? '표준점수 합' : '원점수 합';
    document.getElementById('top-n-title').innerText = `${basisLabel} 상위 학생`;

    const thead = document.getElementById('top20-thead');
    thead.innerHTML = `
        <tr>
            <th class="px-4 py-3 text-center w-16">순위</th>
            <th class="px-4 py-3 text-center">반</th>
            <th class="px-4 py-3 text-center">번호</th>
            <th class="px-4 py-3 text-center">이름</th>
            <th class="px-4 py-3 text-center text-blue-700 bg-blue-50/50">${basisLabel}</th>
            <th class="px-4 py-3 text-center">국어 선택</th>
            <th class="px-4 py-3 text-center">수학 선택</th>
            <th class="px-4 py-3 text-center">탐구1 선택</th>
            <th class="px-4 py-3 text-center">탐구2 선택</th>
        </tr>
    `;

    const tbody = document.getElementById('top20-tbody');
    tbody.innerHTML = topData.map((s, i) => {
        const sumScore = getSum(s, basis);
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 text-center font-bold text-slate-500">${i + 1}</td>
                <td class="px-4 py-3 text-center">${s.class || '-'}</td>
                <td class="px-4 py-3 text-center">${s.number || '-'}</td>
                <td class="px-4 py-3 text-center font-semibold text-slate-800">${s.name || '-'}</td>
                <td class="px-4 py-3 text-center font-bold text-blue-600 bg-blue-50/20">${sumScore > 0 ? sumScore : '-'}</td>
                <td class="px-4 py-3 text-center text-base">${s.korean?.subject || '-'}</td>
                <td class="px-4 py-3 text-center text-base">${s.math?.subject || '-'}</td>
                <td class="px-4 py-3 text-center text-base">${s.inquiry1?.subject || '-'}</td>
                <td class="px-4 py-3 text-center text-base">${s.inquiry2?.subject || '-'}</td>
            </tr>
        `;
    }).join('');
}

/* ───────────────────────────────────────────
   § 2. 점수 급간별 인원 분포 (전역 기준 적용 및 가로 표 추가)
─────────────────────────────────────────── */
function renderScoreDistribution() {
    const intervalSize = parseInt(document.getElementById('interval-size').value, 10);
    const basis = globalReportBasis;
    const basisLabel = basis === 'std' ? '표준점수' : '원점수';

    document.getElementById('dist-title').innerText = `총점 급간별 인원 분포 (${basisLabel})`;

    const sums = ST.data.map(s => {
        let sum = 0;
        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
            if (s[subj] && typeof s[subj][basis] === 'number') sum += s[subj][basis];
        });
        return sum;
    }).filter(sum => sum > 0);

    if (sums.length === 0) return;

    const maxScore = Math.max(...sums);
    const upperLimit = Math.ceil(maxScore / intervalSize) * intervalSize;
    const numBins = Math.ceil(upperLimit / intervalSize);

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
        type: 'bar', data: {
            labels: labels, datasets: [{
                label: '인원(명)',
                data: counts,
                backgroundColor: 'rgba(16, 185, 129, 0.6)', // Emerald
                borderColor: '#059669',
                borderWidth: 1,
                borderRadius: {topLeft: 4, topRight: 4},
                categoryPercentage: 1.0,
                barPercentage: 0.95
            }]
        }, options: {
            responsive: true, maintainAspectRatio: false, plugins: {
                legend: {display: false},
                tooltip: {callbacks: {title: (ctx) => `${ctx[0].label}점 구간`, label: (ctx) => ` ${ctx.raw}명`}}
            }, scales: {
                y: {beginAtZero: true, ticks: {stepSize: 1, font: {size: 14}}},
                x: {grid: {display: false}, ticks: {font: {size: 12}, maxRotation: 45, minRotation: 0}}
            }
        }
    });

    // --- ★ 표 렌더링 (가로 방향) ---
    const thead = document.getElementById('score-dist-thead');
    const tbody = document.getElementById('score-dist-tbody');

    // 헤더 행: '구분' + 각 급간 레이블
    thead.innerHTML = `<tr>
        <th class="px-4 py-3 text-center bg-slate-100 whitespace-nowrap">점수 급간</th>
        ${labels.map(label => `<th class="px-3 py-3 text-center whitespace-nowrap">${label}</th>`).join('')}
    </tr>`;

    // 데이터 행: '인원수' + 각 급간 인원수 카운트
    tbody.innerHTML = `<tr>
        <td class="px-4 py-3 text-center font-bold bg-slate-50 text-slate-700 whitespace-nowrap">인원 (명)</td>
        ${counts.map(c => `<td class="px-3 py-3 text-center text-slate-600 ${c > 0 ? 'font-bold text-emerald-600' : ''}">${c}</td>`).join('')}
    </tr>`;
}

/* ───────────────────────────────────────────
   § 3. 과목별 성적 분포 종합 (등급 or 백분위)
─────────────────────────────────────────── */
function renderCharts() {
    const grid = document.getElementById('chart-grid');
    grid.innerHTML = '';
    const chartBasis = document.getElementById('chart-basis').value; // 'grade' or 'pct'

    if (ST.charts) {
        Object.keys(ST.charts).forEach(key => {
            if (key !== 'scoreDist' && ST.charts[key]) ST.charts[key].destroy();
        });
    } else {
        ST.charts = {};
    }

    const dataCounts = {};

    const addData = (subjName, value) => {
        if (!subjName || typeof value !== 'number') return;
        if (!dataCounts[subjName]) {
            // 등급은 9개 배열, 백분위는 10개 배열(0~9, 10~19 ... 90~100)
            dataCounts[subjName] = chartBasis === 'grade' ? Array(9).fill(0) : Array(10).fill(0);
        }

        if (chartBasis === 'grade') {
            if (value >= 1 && value <= 9) dataCounts[subjName][value - 1]++;
        } else if (chartBasis === 'pct') {
            if (value >= 0 && value <= 100) {
                let bin = Math.floor(value / 10);
                if (bin === 10) bin = 9; // 100점은 90~100 구간에 포함
                dataCounts[subjName][bin]++;
            }
        }
    };

    ST.data.forEach(s => {
        if (s.korean && s.korean[chartBasis]) addData('국어 종합', s.korean[chartBasis]);
        if (s.math && s.math[chartBasis]) addData('수학 종합', s.math[chartBasis]);

        // 영어, 한국사는 백분위가 없을 수 있으므로 예외 처리
        if (chartBasis === 'grade') {
            if (s.english?.grade) addData('영어', s.english.grade);
            if (s.history?.grade) addData('한국사', s.history.grade);
        }

        if (s.inquiry1?.subject && s.inquiry1[chartBasis]) addData(s.inquiry1.subject, s.inquiry1[chartBasis]);
        if (s.inquiry2?.subject && s.inquiry2[chartBasis]) addData(s.inquiry2.subject, s.inquiry2[chartBasis]);
    });

    const xLabels = chartBasis === 'grade' ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : ['0~9', '10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90~100'];

    const colors = [{bg: 'rgba(139, 92, 246, 0.7)', border: '#7c3aed'}, // Violet
        {bg: 'rgba(59, 130, 246, 0.7)', border: '#2563eb'}, // Blue
        {bg: 'rgba(236, 72, 153, 0.7)', border: '#db2777'}, // Pink
        {bg: 'rgba(245, 158, 11, 0.7)', border: '#d97706'}  // Amber
    ];

    let colorIdx = 0;

    Object.entries(dataCounts).forEach(([subjName, counts], index) => {
        if (counts.every(c => c === 0)) return;

        const id = `chart-subj-${index}`;
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm';
        div.innerHTML = `
            <p class="text-base font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2 flex justify-between items-center">
                <span>${subjName}</span>
                <span class="text-base font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">총 ${counts.reduce((a, b) => a + b, 0)}명</span>
            </p>
            <div class="relative h-56 w-full"><canvas id="${id}"></canvas></div>
        `;
        grid.appendChild(div);

        const theme = colors[colorIdx % colors.length];
        colorIdx++;

        ST.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar', data: {
                labels: xLabels, datasets: [{
                    label: '인원(명)',
                    data: counts,
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            }, options: {
                responsive: true, maintainAspectRatio: false, plugins: {
                    legend: {display: false}, tooltip: {
                        callbacks: {
                            title: (ctx) => chartBasis === 'grade' ? `${ctx[0].label}등급` : `${ctx[0].label}% 구간`,
                            label: (ctx) => ` ${ctx.raw}명`
                        }
                    }
                }, scales: {
                    y: {beginAtZero: true, ticks: {stepSize: 1, font: {size: 12}}},
                    x: {grid: {display: false}, ticks: {font: {size: 12, weight: 'bold'}}}
                }
            }
        });
    });
}