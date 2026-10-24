import Chart from 'chart.js/auto';
import {ST} from '../main.js';
import {showBinStudentsModal} from './report-modal.js';
import {basisAvailable, missingBasisMessage} from '../core/aggregate.js';
import {escapeAttr, sameInquirySubject} from '../utils.js';
import {GRADE_MAX, GRADE_MIN, isValidGrade, PCT_MAX, PCT_MIN, SCORE_BIN, STD_MAX} from '../core/limits.js';

/* ───────────────────────────────────────────
   § 과목별 성적 분포 종합 (등급 or 백분위)
─────────────────────────────────────────── */
export function renderSubjectsCharts() {
    if (!ST.data) return; // 파일을 새로 올리는 중에는 데이터가 비어 있다
    const grid = document.getElementById('chart-grid');
    grid.innerHTML = '';
    const basisSelect = document.getElementById('chart-basis');
    const gradeOption = basisSelect.querySelector('option[value="grade"]');
    if (gradeOption) gradeOption.textContent = `등급 분포 (${GRADE_MIN}~${GRADE_MAX})`;
    const chartBasis = basisSelect.value; // 'grade', 'pct', 'std'
    // 이 차트의 기준 선택도 전역 기준과 같은 규칙: 값이 없으면 알리고 다른 기준으로 대신하지 않는다
    if (chartBasis !== 'grade' && !basisAvailable(ST.data, chartBasis)) {
        const note = document.createElement('p');
        note.className = 'col-span-full p-8 text-slate-400 text-center';
        note.textContent = missingBasisMessage(chartBasis);
        grid.appendChild(note);
        // 빠져나가지 않는다: 아래에서 이전 차트를 정리해야 하고, 영어·한국사 등급 차트는 그대로 그린다
    }

    if (!ST.charts) {
        ST.charts = {};
    }

    Object.keys(ST.charts).forEach(key => {
        // 'chart-subj-' 로 시작하는 하단 바 차트들만 선택해서 삭제
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
            // [수정된 부분 1] 기준(Basis)에 따라 배열의 크기를 동적으로 설정 (표준점수는 20칸)
            let arrayLength = Math.ceil((PCT_MAX - PCT_MIN) / SCORE_BIN); // 기본 백분위
            if (finalBasis === 'grade') arrayLength = GRADE_MAX - GRADE_MIN + 1; else if (finalBasis === 'std') arrayLength = Math.ceil(STD_MAX / SCORE_BIN);

            dataCounts[subjName] = {
                counts: Array(arrayLength).fill(0), basis: finalBasis, originalName: subjName // 필터링 시 과목 식별용
            };
        }

        if (finalBasis === 'grade') {
            // 등급은 GRADE_MIN~GRADE_MAX 정수만 막대에 센다. 막대를 눌러 여는 명단도 같은 규칙을 쓴다(소수 등급이 막대에서만 빠지지 않게)
            if (isValidGrade(value)) dataCounts[subjName].counts[value - GRADE_MIN]++;
        } else if (finalBasis === 'pct') {
            // 백분위(pct) 처리 로직: PCT_MIN ~ PCT_MAX, 만점은 마지막 구간에 넣는다
            if (value >= PCT_MIN && value <= PCT_MAX) {
                const lastBin = dataCounts[subjName].counts.length - 1;
                const bin = Math.min(Math.floor((value - PCT_MIN) / SCORE_BIN), lastBin);
                dataCounts[subjName].counts[bin]++;
            }
        } else if (finalBasis === 'std') {
            // 표준점수(std) 처리 로직
            if (value >= 0) {
                let bin = Math.floor(value / SCORE_BIN);
                // 구간이 STD_MAX / SCORE_BIN 개이므로 135점은 bin 13에 정확히 집계됨
                const maxBinIndex = dataCounts[subjName].counts.length - 1;
                if (bin > maxBinIndex) {
                    bin = maxBinIndex; // STD_MAX 를 초과하는 기형적 극단값 방어
                }
                dataCounts[subjName].counts[bin]++;
            }
        }
    };

    ST.data.forEach(s => {
        // 국어
        if (s.korean && s.korean[chartBasis] != null) addData('국어 종합', s.korean[chartBasis]);

        // 수학
        if (s.math && s.math[chartBasis] != null) addData('수학 종합', s.math[chartBasis]);

        // 영어 (절대평가 등급)
        if (s.english?.grade != null) addData('영어', s.english.grade, 'grade');

        // 한국사 (절대평가 등급)
        if (s.hist?.grade != null) addData('한국사', s.hist.grade, 'grade');

        // 탐구 1 (과목명이 있고, 점수/등급이 null이 아닐 때)
        if (s.inquiry1?.subject && s.inquiry1[chartBasis] != null) addData(s.inquiry1.subject, s.inquiry1[chartBasis]);

        // 탐구 2 (탐구1 과 같은 과목이면 한 번만 센다. 막대 명단도 탐구1 점수로 거른다)
        if (s.inquiry2?.subject && s.inquiry2[chartBasis] != null && !sameInquirySubject(s)) addData(s.inquiry2.subject, s.inquiry2[chartBasis]);
    });

    const colors = [{bg: 'rgba(139, 92, 246, 0.7)', border: '#7c3aed'}, {
        bg: 'rgba(59, 130, 246, 0.7)', border: '#2563eb'
    }, {bg: 'rgba(236, 72, 153, 0.7)', border: '#db2777'}, {bg: 'rgba(245, 158, 11, 0.7)', border: '#d97706'}];

    let colorIdx = 0;

    Object.entries(dataCounts).forEach(([subjName, obj], index) => {
        const {counts, basis} = obj;
        if (counts.every(c => c === 0)) return;

        // [수정된 부분 2] X축 라벨을 기준(Basis)에 맞게 동적으로 생성
        let currentLabels = [];
        if (basis === 'grade') {
            currentLabels = Array.from({length: GRADE_MAX - GRADE_MIN + 1}, (_, i) => (i + GRADE_MIN).toString());
        } else if (basis === 'std') {
            // 표준점수 구간 ('0~9' 부터 마지막 구간은 STD_MAX 까지)
            const n = Math.ceil(STD_MAX / SCORE_BIN);
            currentLabels = Array.from({length: n}, (_, i) => {
                const min = i * SCORE_BIN;
                const max = (i === n - 1) ? STD_MAX : (min + SCORE_BIN - 1);
                return `${min}~${max}`;
            });
        } else {
            // 백분위 구간 (마지막 구간은 PCT_MAX 까지)
            const n = Math.ceil((PCT_MAX - PCT_MIN) / SCORE_BIN);
            currentLabels = Array.from({length: n}, (_, i) => {
                const min = PCT_MIN + i * SCORE_BIN;
                const max = (i === n - 1) ? PCT_MAX : (min + SCORE_BIN - 1);
                return `${min}~${max}`;
            });
        }

        // [수정된 부분 3] 단위 및 라벨 텍스트 분기 처리 (표준점수 추가)
        const basisLabelText = basis === 'grade' ? '등급' : (basis === 'std' ? '표준점수' : '백분위');
        const unitText = basis === 'grade' ? '등급' : (basis === 'std' ? '점대' : '%');

        const id = `chart-subj-${index}`;
        const div = document.createElement('div');
        div.className = 'bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
        div.innerHTML = `
            <p class="text-base font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2 flex flex-col items-start gap-2">
                <span>${escapeAttr(subjName)} <small class="text-slate-400 font-normal">(${basisLabelText})</small></span>
                <span class="text-base font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">총 ${counts.reduce((a, b) => a + b, 0)}명</span>
            </p>
            <div class="relative w-full cursor-pointer"><canvas id="${id}"></canvas></div>
        `;
        grid.appendChild(div);

        const theme = colors[colorIdx % colors.length];
        colorIdx++;

        ST.charts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar', data: {
                labels: currentLabels, datasets: [{
                    label: '인원(명)',
                    data: counts,
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            }, options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 1.5, // ★ 클릭 이벤트 추가
                onClick: (event, elements) => {
                    if (elements.length > 0 && ST.data) {
                        const idx = elements[0].index;
                        const label = currentLabels[idx];

                        // 클릭한 해당 과목의 학생들만 필터링
                        const studentsInBin = ST.data.filter(s => {
                            let targetValue = null;

                            // 1. 과목 찾기
                            if (subjName === '국어 종합') targetValue = s.korean?.[basis]; else if (subjName === '수학 종합') targetValue = s.math?.[basis]; else if (subjName === '영어') targetValue = s.english?.grade; else if (subjName === '한국사') targetValue = s.hist?.grade; else if (s.inquiry1?.subject === subjName) targetValue = s.inquiry1[basis]; else if (s.inquiry2?.subject === subjName) targetValue = s.inquiry2[basis];

                            if (targetValue === null || typeof targetValue !== 'number') return false;

                            // 2. 등급 기준일 때
                            if (basis === 'grade') {
                                return isValidGrade(targetValue) && targetValue === idx + GRADE_MIN;
                            } else {
                                // 집계 시 사용한 floor 기반 binning과 동일한 로직으로 비교
                                // (정수 범위 비교는 89.5 같은 소수점 값을 잘못 걸러냄)
                                const maxIndex = currentLabels.length - 1;
                                let bin = Math.floor((targetValue - (basis === 'pct' ? PCT_MIN : 0)) / SCORE_BIN);
                                if (bin > maxIndex) bin = maxIndex;
                                return bin === idx;
                            }
                        });

                        showBinStudentsModal(`${subjName} ${label}${unitText}`, studentsInBin);
                    }
                }, plugins: {
                    legend: {display: false}, tooltip: {
                        callbacks: {
                            title: (ctx) => basis === 'grade' ? `${ctx[0].label}등급` : `${ctx[0].label}${unitText} 구간`,
                            label: (ctx) => ` ${ctx.raw}명`
                        }
                    }
                }, scales: {
                    y: {beginAtZero: true, ticks: {stepSize: 1}}, x: {grid: {display: false}}
                }
            }
        });
    });
}