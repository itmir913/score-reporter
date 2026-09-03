import {ST} from './main.js';
import {computeRenderCache} from './report/report-cache.js';
import {renderCsatMinRequirement} from './report/report-csat-sum.js';
import {renderSubjectsCharts} from './report/report-render-chart-subjects.js';
import {renderStats} from './report/report-render-stats.js';
import {renderTopN} from './report/report-render-topN.js';
import {renderScoreDistribution} from './report/report-score-distribution.js';
import {renderSubjectSelection} from './report/report-subject-selection.js';

// ★ 전역 상태: 현재 통계 기준 (raw: 원점수, std: 표준점수)
export let globalReportBasis = 'raw';
export const labelMap = {'raw': '원점수', 'std': '표준점수', 'pct': '백분위'};

/* ───────────────────────────────────────────
   § 통계 기준 설정 및 UI 업데이트
─────────────────────────────────────────── */
export function setGlobalBasis(basis) {
    globalReportBasis = basis;

    const buttons = {
        raw: document.getElementById('btn-basis-raw'),
        std: document.getElementById('btn-basis-std'),
        pct: document.getElementById('btn-basis-pct')
    };

    Object.keys(buttons).forEach(key => {
        if (key === basis) {
            buttons[key].className = 'px-4 py-2 text-base font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all';
        } else {
            buttons[key].className = 'px-4 py-2 text-base font-medium rounded-md text-slate-500 hover:text-slate-700 transition-all';
        }
    });

    renderAll();
}

/* ───────────────────────────────────────────
   § 보고서 생성 로직
─────────────────────────────────────────── */
export function renderReport() {
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

    const dateStr = `분석 일시: ${new Date().toLocaleDateString()}`;
    if (document.getElementById('print-date-top')) {
        document.getElementById('print-date-top').innerText = dateStr;
    }

    renderAll();
}

/* ───────────────────────────────────────────
   § 모든 렌더링 함수
─────────────────────────────────────────── */
export function renderAll() {
    // 1. ST.data가 유효한 배열인지 최우선 확인
    if (!ST.data || !Array.isArray(ST.data) || ST.data.length === 0) {
        console.warn("표시할 데이터가 없거나 로딩 중입니다.");
        // 데이터가 없을 때 화면을 비우거나 초기화하는 로직이 필요하다면 여기에 추가
        return;
    }

    try {
        // 2. 캐시 생성 시도
        const cache = computeRenderCache(ST.data, globalReportBasis);

        // 3. 캐시 결과가 정상인지 확인 (computeRenderCache가 null을 반환할 경우 대비)
        if (!cache) {
            console.error("캐시 생성에 실패했습니다.");
            return;
        }

        ST.cache = cache;

        // 4. 하위 렌더링 함수 실행
        // 각 함수 내부에서도 에러가 날 수 있으므로 순차적으로 실행
        renderStats(cache);
        renderTopN(cache);

        renderScoreDistribution(cache);
        renderSubjectSelection(cache);
        renderSubjectsCharts();
        renderCsatMinRequirement(cache);

    } catch (error) {
        console.error("렌더링 도중 오류가 발생했습니다:", error);
    }
}

/* ───────────────────────────────────────────
   § 리사이즈 디바운스
─────────────────────────────────────────── */
export let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const reportContent = document.getElementById('report-content');
        if (reportContent && !reportContent.classList.contains('hidden')) {
            renderAll();
        }
    }, 1000);
});