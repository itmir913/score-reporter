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

    // 1. 통계 렌더링
    renderStats();
    // 2. 상위 N명 명단 렌더링 (옵션 적용)
    renderTopN();
    // 3. 점수 급간별 분포 렌더링 (원점수 합 기준)
    renderScoreDistribution();
    // 4. 과목별 등급 분포 차트 렌더링 (탐구 통합)
    renderCharts();
}

function renderStats() {
    // ... (기존 renderStats 코드 유지) ...
    // 필요에 따라 원점수/표점 등을 추가로 계산하여 stat-cards에 넣을 수 있습니다.
}

/* ───────────────────────────────────────────
   § 상위 N명 명단 렌더링 (기준 점수 및 인원 변경 가능)
─────────────────────────────────────────── */
function renderTopN() {
    const limit = parseInt(document.getElementById('top-n-count').value, 10);
    const basis = document.getElementById('top-n-basis').value; // 'std' or 'raw'

    // 기준 점수 계산 함수 (학생 객체 s를 받아 총합 반환)
    const getSum = (s, type) => {
        let sum = 0;
        // 국, 수, 탐1, 탐2의 점수 합산 (데이터가 없으면 0)
        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
            if (s[subj] && typeof s[subj][type] === 'number') {
                sum += s[subj][type];
            }
        });
        return sum;
    };

    // 데이터 복사 후 정렬
    const sortedData = [...ST.data].sort((a, b) => getSum(b, basis) - getSum(a, basis));
    const topData = sortedData.slice(0, limit);

    // 테이블 헤더 및 제목 설정
    const basisLabel = basis === 'std' ? '표준점수 합' : '원점수 합';
    document.getElementById('top-n-title').innerText = `${basisLabel} 상위 ${limit}인`;

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

    // 테이블 본문 렌더링
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
                <td class="px-4 py-3 text-center text-sm">${s.korean?.subject || '-'}</td>
                <td class="px-4 py-3 text-center text-sm">${s.math?.subject || '-'}</td>
                <td class="px-4 py-3 text-center text-sm">${s.inquiry1?.subject || '-'}</td>
                <td class="px-4 py-3 text-center text-sm">${s.inquiry2?.subject || '-'}</td>
            </tr>
        `;
    }).join('');
}


/* ───────────────────────────────────────────
   § 과목별 등급 분포 종합 (탐구 통합)
─────────────────────────────────────────── */
function renderCharts() {
    const grid = document.getElementById('chart-grid');
    grid.innerHTML = ''; // 초기화

    // 기존 차트 파괴 (메모리 누수 방지)
    if (ST.charts) {
        Object.values(ST.charts).forEach(c => {
            if (c && typeof c.destroy === 'function') c.destroy();
        });
    }
    ST.charts = {};

    // 1. 모든 학생 데이터를 순회하며 과목별 등급 카운트 집계
    // 데이터 구조: { "국어": [0,0,0,0,0,0,0,0,0], "수학": [...], "물리학I": [...], ... }
    const gradeCounts = {};

    const addGrade = (subjName, grade) => {
        if (!subjName || typeof grade !== 'number' || grade < 1 || grade > 9) return;
        if (!gradeCounts[subjName]) {
            gradeCounts[subjName] = Array(9).fill(0);
        }
        gradeCounts[subjName][grade - 1]++;
    };

    ST.data.forEach(s => {
        // 공통/필수 과목 (과목명이 없으면 기본 이름 사용)
        if (s.korean && s.korean.grade) addGrade('국어 종합', s.korean.grade);
        if (s.math && s.math.grade) addGrade('수학 종합', s.math.grade);
        if (s.english && s.english.grade) addGrade('영어', s.english.grade);
        if (s.history && s.history.grade) addGrade('한국사', s.history.grade);

        // ★ 탐구 과목: 탐구1, 탐구2 구분 없이 '과목명'을 기준으로 카운트 누적
        if (s.inquiry1 && s.inquiry1.subject && s.inquiry1.grade) {
            addGrade(s.inquiry1.subject, s.inquiry1.grade);
        }
        if (s.inquiry2 && s.inquiry2.subject && s.inquiry2.grade) {
            addGrade(s.inquiry2.subject, s.inquiry2.grade);
        }
        // 제2외국어
        if (s.foreign2 && s.foreign2.subject && s.foreign2.grade) {
            addGrade(s.foreign2.subject, s.foreign2.grade);
        }
    });

    // 2. 집계된 데이터를 바탕으로 차트 생성
    const glabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    // 차트를 그릴 때 사용할 색상 배열 (순환해서 사용)
    const colors = [
        { bg: 'rgba(59, 130, 246, 0.7)', border: '#2563eb' }, // Blue
        { bg: 'rgba(16, 185, 129, 0.7)', border: '#059669' }, // Emerald
        { bg: 'rgba(245, 158, 11, 0.7)', border: '#d97706' }, // Amber
        { bg: 'rgba(139, 92, 246, 0.7)', border: '#7c3aed' }, // Violet
        { bg: 'rgba(236, 72, 153, 0.7)', border: '#db2777' }  // Pink
    ];

    let colorIdx = 0;

    Object.entries(gradeCounts).forEach(([subjName, counts], index) => {
        // 모두 0명이면 그리지 않음
        if (counts.every(c => c === 0)) return;

        const id = `chart-grade-${index}`;
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm';
        div.innerHTML = `
            <p class="text-base font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2 flex justify-between items-center">
                <span>${subjName}</span>
                <span class="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded">총 ${counts.reduce((a,b)=>a+b,0)}명</span>
            </p>
            <div class="relative h-48 w-full"><canvas id="${id}"></canvas></div>
        `;
        grid.appendChild(div);

        const colorTheme = colors[colorIdx % colors.length];
        colorIdx++;

        ST.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: glabels,
                datasets: [{
                    label: '인원(명)',
                    data: counts,
                    backgroundColor: colorTheme.bg,
                    borderColor: colorTheme.border,
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (ctx) => `${ctx[0].label}등급`,
                            label: (ctx) => ` ${ctx.raw}명`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, font: { size: 11 } },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 12, weight: 'bold' } }
                    }
                }
            }
        });
    });
}


/* ───────────────────────────────────────────
   § 점수 급간별 인원 분포 (원점수 합 기준)
─────────────────────────────────────────── */
function renderScoreDistribution() {
    const intervalSize = parseInt(document.getElementById('interval-size').value, 10);

    // 1. 모든 학생의 원점수 합 계산
    const rawSums = ST.data.map(s => {
        let sum = 0;
        ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
            if (s[subj] && typeof s[subj].raw === 'number') {
                sum += s[subj].raw;
            }
        });
        return sum;
    }).filter(sum => sum > 0); // 0점인 경우는 결시 등으로 간주하여 제외

    if (rawSums.length === 0) return;

    // 2. 급간 계산
    const maxScore = Math.max(...rawSums);
    // 최대 점수 기준으로 가장 가까운 상위 급간 구간을 찾음 (예: max 283 -> 290)
    const upperLimit = Math.ceil(maxScore / intervalSize) * intervalSize;

    // 구간 레이블과 카운트 배열 초기화
    const labels = [];
    const counts = [];

    // 예: intervalSize 10일 때, 0~9, 10~19, ... 형태로 만들 수도 있고,
    // 대개 고득점부터 보는 것이 편하므로 내림차순 또는 오름차순으로 생성
    // 여기서는 직관적인 오름차순 히스토그램으로 구현
    const numBins = Math.ceil(upperLimit / intervalSize);

    for (let i = 0; i < numBins; i++) {
        const min = i * intervalSize;
        const max = min + intervalSize - 1;
        labels.push(`${min}~${max}`);
        counts.push(0);
    }

    // 3. 인원 배치
    rawSums.forEach(score => {
        // 점수가 upperLimit과 같거나 크면 마지막 인덱스에 넣음
        let binIndex = Math.floor(score / intervalSize);
        if (binIndex >= numBins) binIndex = numBins - 1;
        counts[binIndex]++;
    });

    // 4. 차트 그리기
    const canvasId = 'score-dist-chart';
    if (ST.charts['scoreDist']) {
        ST.charts['scoreDist'].destroy();
    }

    ST.charts['scoreDist'] = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '인원(명)',
                data: counts,
                backgroundColor: 'rgba(99, 102, 241, 0.6)', // Indigo
                borderColor: '#4f46e5',
                borderWidth: 1,
                borderRadius: { topLeft: 4, topRight: 4 },
                categoryPercentage: 1.0, // 히스토그램처럼 막대 사이 간격을 없앰
                barPercentage: 0.95
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (ctx) => `${ctx[0].label}점 구간`,
                        label: (ctx) => ` ${ctx.raw}명`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 12 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0 }
                }
            }
        }
    });
}