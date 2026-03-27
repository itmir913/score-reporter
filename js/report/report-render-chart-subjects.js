/* ───────────────────────────────────────────
   § 과목별 성적 분포 종합 (등급 or 백분위)
─────────────────────────────────────────── */
function renderSubjectsCharts() {
    const MAX_GRADE = 9;
    const grid = document.getElementById('chart-grid');
    grid.innerHTML = '';
    const chartBasis = document.getElementById('chart-basis').value; // 'grade' or 'pct'

    if (!ST.charts) {
        ST.charts = {};
    }

    Object.keys(ST.charts).forEach(key => {
        // 'chart-subj-' 로 시작하는 하단 바 차트들만 골라서 삭제
        if (key.startsWith('chart-subj-') && ST.charts[key]) {
            ST.charts[key].destroy();
            delete ST.charts[key];
        }
    });

    const dataCounts = {};

    const addData = (subjName, value, forceBasis = null) => {
        if (!subjName || typeof value !== 'number') return;
        const finalBasis = forceBasis || chartBasis;

        if (!dataCounts[subjName]) {
            dataCounts[subjName] = {
                counts: finalBasis === 'grade' ? Array(MAX_GRADE).fill(0) : Array(10).fill(0),
                basis: finalBasis,
                originalName: subjName // 필터링 시 과목 식별용
            };
        }

        if (finalBasis === 'grade') {
            if (value >= 1 && value <= MAX_GRADE) dataCounts[subjName].counts[value - 1]++;
        } else {
            if (value >= 0 && value <= 100) {
                let bin = Math.floor(value / 10);
                if (bin === 10) bin = 9;
                dataCounts[subjName].counts[bin]++;
            }
        }
    };

    ST.data.forEach(s => {
        // 국어
        if (s.korean && s.korean[chartBasis] != null)
            addData('국어 종합', s.korean[chartBasis]);

        // 수학
        if (s.math && s.math[chartBasis] != null)
            addData('수학 종합', s.math[chartBasis]);

        // 영어 (절대평가 등급)
        if (s.english?.grade != null)
            addData('영어', s.english.grade, 'grade');

        // 한국사 (절대평가 등급)
        if (s.hist?.grade != null)
            addData('한국사', s.hist.grade, 'grade');

        // 탐구 1 (과목명이 있고, 점수/등급이 null이 아닐 때)
        if (s.inquiry1?.subject && s.inquiry1[chartBasis] != null)
            addData(s.inquiry1.subject, s.inquiry1[chartBasis]);

        // 탐구 2
        if (s.inquiry2?.subject && s.inquiry2[chartBasis] != null)
            addData(s.inquiry2.subject, s.inquiry2[chartBasis]);
    });

    const colors = [
        {bg: 'rgba(139, 92, 246, 0.7)', border: '#7c3aed'},
        {bg: 'rgba(59, 130, 246, 0.7)', border: '#2563eb'},
        {bg: 'rgba(236, 72, 153, 0.7)', border: '#db2777'},
        {bg: 'rgba(245, 158, 11, 0.7)', border: '#d97706'}
    ];

    let colorIdx = 0;

    Object.entries(dataCounts).forEach(([subjName, obj], index) => {
        const {counts, basis} = obj;
        if (counts.every(c => c === 0)) return;

        const currentLabels = basis === 'grade'
            ? Array.from({length: MAX_GRADE}, (_, i) => (i + 1).toString())
            : ['0~9', '10~19', '20~29', '30~39', '40~49', '50~59', '60~69', '70~79', '80~89', '90~100'];

        const id = `chart-subj-${index}`;
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm';
        div.innerHTML = `
            <p class="text-base font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2 flex justify-between items-center">
                <span>${subjName} <small class="text-slate-400 font-normal">(${basis === 'grade' ? '등급' : '백분위'})</small></span>
                <span class="text-base font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">총 ${counts.reduce((a, b) => a + b, 0)}명</span>
            </p>
            <div class="relative w-full cursor-pointer"><canvas id="${id}"></canvas></div>
        `;
        grid.appendChild(div);

        const theme = colors[colorIdx % colors.length];
        colorIdx++;

        ST.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: {
                labels: currentLabels,
                datasets: [{
                    label: '인원(명)',
                    data: counts,
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.5,
                // ★ 클릭 이벤트 추가
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const label = currentLabels[idx];

                        // 클릭한 해당 과목의 학생들만 필터링
                        const studentsInBin = ST.data.filter(s => {
                            let targetValue = null;

                            // 1. 과목 찾기
                            if (subjName === '국어 종합') targetValue = s.korean?.[basis];
                            else if (subjName === '수학 종합') targetValue = s.math?.[basis];
                            else if (subjName === '영어') targetValue = s.english?.grade;
                            else if (subjName === '한국사') targetValue = s.hist?.grade;
                            else if (s.inquiry1?.subject === subjName) targetValue = s.inquiry1[basis];
                            else if (s.inquiry2?.subject === subjName) targetValue = s.inquiry2[basis];

                            if (targetValue === null || typeof targetValue !== 'number') return false;

                            // 2. 등급 기준일 때
                            if (basis === 'grade') {
                                return Math.round(targetValue) === (idx + 1);
                            }
                            // 3. 백분위 기준일 때 (10단위 구간)
                            else {
                                const min = idx * 10;
                                const max = (idx === 9) ? 100 : (idx * 10 + 9);
                                return targetValue >= min && targetValue <= max;
                            }
                        });

                        showBinStudentsModal(`${subjName} ${label}${basis === 'grade' ? '등급' : '%'}`, studentsInBin);
                    }
                },
                plugins: {
                    legend: {display: false},
                    tooltip: {
                        callbacks: {
                            title: (ctx) => basis === 'grade' ? `${ctx[0].label}등급` : `${ctx[0].label}% 구간`,
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
    });
}