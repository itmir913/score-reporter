import {ST} from './main.js';
import {missingBasisMessage} from './core/aggregate.js';
import {computeRenderCache} from './report/report-cache.js';
import {showStudentAt} from './report/report-modal.js';
import {mountStudentTable} from './ui/studentTable.js';
import {renderCsatMinRequirement} from './report/report-csat-sum.js';
import {renderSubjectsCharts} from './report/report-render-chart-subjects.js';
import {renderStats} from './report/report-render-stats.js';
import {renderTopN} from './report/report-render-topN.js';
import {renderScoreDistribution} from './report/report-score-distribution.js';
import {renderSubjectSelection} from './report/report-subject-selection.js';

// ★ 전역 상태: 현재 통계 기준 (raw: 원점수, std: 표준점수)
export let globalReportBasis = 'raw';
export const labelMap = {'raw': '원점수', 'std': '표준점수', 'pct': '백분위'};

/** 「탐구 미응시 학생도 포함」 체크 여부. 켜면 탐구 값이 없는 학생을 국어 + 수학으로 합산에 넣는다 */
export function includeNoInquiry() {
    return document.getElementById('include-no-inquiry')?.checked === true;
}

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
            buttons[key].className = 'px-3 py-1 text-base font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all';
        } else {
            buttons[key].className = 'px-3 py-1 text-base font-medium rounded-md text-slate-500 hover:text-slate-700 transition-all';
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
    const hasData = !!ST.data?.length;
    // 인쇄할 것이 없으면 인쇄 단추도 감춘다
    document.getElementById('report-print')?.classList.toggle('hidden', !hasData);
    if (!hasData) {
        wrap.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    empty.classList.add('hidden');

    document.getElementById('report-subtitle').innerText = `「${ST.activeExamKey}」 회차 · 총 ${ST.data.length}명`;
    renderReportNotes();

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
        const cache = computeRenderCache(ST.data, globalReportBasis, {includeNoInquiry: includeNoInquiry()});

        // 3. 캐시 결과가 정상인지 확인 (computeRenderCache가 null을 반환할 경우 대비)
        if (!cache) {
            console.error("캐시 생성에 실패했습니다.");
            return;
        }

        ST.cache = cache;

        // 선택한 기준의 값이 이 회차에 없으면 알리고, 각 표는 숫자 자리를 — 로 둔다(다른 기준으로 바꾸지 않는다)
        const missingNote = document.getElementById('basis-missing-note');
        if (missingNote) missingNote.textContent = cache.basisMissing ? missingBasisMessage(cache.basis) : '';

        // 4. 하위 렌더링 함수 실행
        // 각 함수 내부에서도 에러가 날 수 있으므로 순차적으로 실행
        renderStats(cache);
        renderTopN(cache);

        renderScoreDistribution(cache);
        renderSubjectSelection(cache);
        renderSubjectsCharts();
        renderCsatMinRequirement(cache);
        renderStudentTable(cache);

    } catch (error) {
        console.error("렌더링 도중 오류가 발생했습니다:", error);
    }
}

/* 학생 표. 화면(문서)이 새로 그려졌으면 다시 붙인다 */
let studentTable = null;
let studentTableRoot = null;

function renderStudentTable(cache) {
    const root = document.getElementById('student-grid');
    if (!root) return;
    if (root !== studentTableRoot) {
        studentTableRoot = root;
        studentTable = mountStudentTable({root, onOpen: showStudentAt});
    }
    studentTable.render(ST.data, cache.basis, {includeNoInquiry: cache.includeNoInquiry, title: ST.activeExamKey});
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
/* ───────────────────────────────────────────
   § 보고서 제목·종합 분석: 회차마다 따로 적는다
   적은 글은 그 회차(ST.exams 의 한 항목)에 메모리로 남긴다. 회차를 바꿔도 다른 회차의 글을 덮지 않고,
   돌아오면 적어 둔 글이 그대로 있다. 파일이나 브라우저 저장소에는 남기지 않는다(CLAUDE.md).
─────────────────────────────────────────── */
export const DEFAULT_ANALYSIS = `[이 곳을 클릭하여 시험 총평 및 학습 전략을 입력하세요]

※ 작성 가이드
(보고서 PDF를 인쇄하기 전에 지워주세요)
--------------------------------------------------
▶ 출제 경향: 전년 대비 난이도 변화 및 주요 킬러 문항의 특징
▶ 취약 구간: 정답률이 낮았던 유형 및 학생들이 공통적으로 실수한 개념
▶ 향후 전략: 분석 결과를 바탕으로 한 영역별 보완법과 학습 로드맵 제언
--------------------------------------------------`;

/** 기본 제목: 「5월 모의고사 / 성적 분석 레포트」. 회차 이름이 없으면 「모의고사 / 성적 분석 레포트」 */
export function defaultReportTitle(examKey) {
    const key = String(examKey ?? '').trim();
    return `${key ? `${key} ` : ''}모의고사\n성적 분석 레포트`;
}

const activeExam = () => ST.exams.find(e => e.key === ST.activeExamKey);

function renderReportNotes() {
    const exam = activeExam();
    const title = document.getElementById('report-title');
    const analysis = document.getElementById('report-analysis');
    if (title) title.textContent = exam?.reportTitle ?? defaultReportTitle(exam?.key);
    if (analysis) analysis.textContent = exam?.reportAnalysis ?? DEFAULT_ANALYSIS;
}

// 고친 글을 지금 회차에 적어 둔다
document.addEventListener('input', (event) => {
    const exam = activeExam();
    if (!exam) return;
    if (event.target.id === 'report-title') exam.reportTitle = event.target.innerText ?? event.target.textContent;
    if (event.target.id === 'report-analysis') exam.reportAnalysis = event.target.innerText ?? event.target.textContent;
});
