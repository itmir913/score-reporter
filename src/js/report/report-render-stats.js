import {ST} from '../main.js';
import {labelMap} from '../report.js';

/* ───────────────────────────────────────────
   § 요약 통계 (과목별 고유 컬러 및 지표명 적용)
─────────────────────────────────────────── */
export function renderStats(cache) {
    const total = ST.data.length;
    if (total === 0) return;

    const basis = cache.basis;
    const basisLabel = labelMap[basis]; // '원점수', '표준점수', '백분위'
    const unit = basis === 'pct' ? '%' : '점';

    // Helper: 상위 20% 평균 계산 함수 (응시 인원 기준, 동점자 처리 포함)
    const getTop20Avg = (scores, isLowerBetter = false) => {
        // [핵심 수정] 1. 연산 전 NaN 등 비정상적인 값을 모두 제거한 순수 숫자 배열 생성
        const validScores = scores.filter(Number.isFinite);

        // [핵심 수정] 2. 카운트 기준을 '오염된 전체 배열'이 아닌 '유효한 점수 배열'로 변경
        const count = validScores.length;
        if (count === 0) return "0.0"; // 유효한 응시자가 없을 경우

        // 2. 상위 20% 기준 인원 산출
        const topCount = Math.max(1, Math.ceil(count * 0.2));
        const sorted = [...validScores].sort((a, b) => isLowerBetter ? a - b : b - a);

        // [핵심 수정] 3. 컷오프 경계값(Boundary Score) 확인
        const boundaryValue = sorted[topCount - 1];

        // [핵심 수정] 4. 동점자 구제 로직: 경계값과 같거나 더 좋은 성적을 가진 모든 데이터 추출
        const topSlice = sorted.filter(score =>
            isLowerBetter ? score <= boundaryValue : score >= boundaryValue
        );

        // 5. 최종 산출: 동점자가 포함된 실제 집단의 크기로 평균 계산
        const sum = topSlice.reduce((a, b) => a + b, 0);
        return (sum / topSlice.length).toFixed(1); // topCount가 아닌 동점자가 포함된 topSlice.length로 나눔
    };

    // 각 과목별 실제 응시자 수 기준 상위 20% 계산
    const korTop20Avg = getTop20Avg(cache.korScores);
    const mathTop20Avg = getTop20Avg(cache.mathScores);
    const engTop20Avg = getTop20Avg(cache.engGrades, true); // 등급은 낮을수록 상위권

    document.getElementById('stat-cards').innerHTML = `
        <div class="stat-card bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-slate-500 font-bold mb-1 uppercase tracking-tight">총 응시 인원</span>
            <span class="text-3xl font-black text-slate-800">${total}<span class="text-lg font-normal ml-0.5">명</span></span>
        </div>
        
        <div class="stat-card bg-white border border-slate-200 border-b-4 border-b-blue-500 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-blue-600 font-bold mb-1 uppercase tracking-tight">국어 상위 20% ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-blue-700">${korTop20Avg}<span class="text-lg font-normal ml-0.5">${unit}</span></span>
        </div>

        <div class="stat-card bg-white border border-slate-200 border-b-4 border-b-amber-400 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-amber-600 font-bold mb-1 uppercase tracking-tight">수학 상위 20% ${basisLabel} 평균</span>
            <span class="text-3xl font-black text-amber-600">${mathTop20Avg}<span class="text-lg font-normal ml-0.5">${unit}</span></span>
        </div>

        <div class="stat-card bg-white border border-slate-200 border-b-4 border-b-rose-500 rounded-2xl p-5 flex flex-col justify-center items-center text-center shadow-sm">
            <span class="text-base text-rose-600 font-bold mb-1 uppercase tracking-tight">영어 상위 20% 등급</span>
            <span class="text-3xl font-black text-rose-700">${engTop20Avg}<span class="text-lg font-normal ml-0.5">등급</span></span>
        </div>
    `;
}