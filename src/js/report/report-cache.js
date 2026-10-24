import {basisAvailable, compositeScore, lacksInquiryOnly} from '../core/aggregate.js';
import {hasScore, inquiryScores} from '../utils.js';
import {csatSumsOf} from './report-csat-sum.js';
import {isValidGrade} from '../core/limits.js';

/* ───────────────────────────────────────────
   § renderAll() 공용 캐시 계산
   ST.data를 단 한 번만 순회하여 모든 렌더링 함수에
   필요한 집계 데이터를 미리 계산합니다.
─────────────────────────────────────────── */
export function computeRenderCache(data, basis, {includeNoInquiry = false} = {}) {
    // [안전 장치] 데이터가 없으면 빈 객체 반환
    if (!data || !Array.isArray(data) || data.length === 0) {
        return {
            korScores: [], mathScores: [], engGrades: [], studentWithSums: [], basis, includeNoInquiry, noInquiryCount: 0, basisMissing: true,
            korSubjectStats: {}, mathSubjectStats: {}, inqSubjectStats: {}, csatSums: []
        };
    }

    const korScores = [];
    const mathScores = [];
    const engGrades = [];
    const studentWithSums = [];  // [{s, sum}]  — topN · 분포 공용
    const korSubjectStats = {};
    const mathSubjectStats = {};
    const inqSubjectStats = {};
    const csatSums = [];  // csatSumsOf(s) 결과(메모), data와 동일 인덱스
    let noInquiryCount = 0;  // 국어·수학은 있는데 탐구가 없는 학생 수

    /* ── 선택과목 통계 누적 헬퍼 ── */
    const accSubject = (statsObj, subjectName, scoreObj) => {
        if (!subjectName || typeof subjectName !== 'string' || !subjectName.trim()) return;
        // 응시 여부는 점수로 판단한다. 과목명만 있고 점수가 하나도 없으면 세지 않는다
        if (!hasScore(scoreObj)) return;
        if (!statsObj[subjectName]) {
            statsObj[subjectName] = {
                count: 0,
                sumRaw: 0, validRawCount: 0,
                sumStd: 0, validStdCount: 0,
                sumPct: 0, validPctCount: 0,
                sumGrade: 0, validGradeCount: 0
            };
        }
        const d = statsObj[subjectName];
        d.count++;
        if (!scoreObj) return;

        // 원점수는 raw 만 본다. 원점수 열이 없는 양식이면 파서가 이미 공통+선택으로 채워 두었고,
        // 여기서 다시 더하면 원점수 열이 있는 양식에서 빈 칸 하나가 0점이 된다.
        if (Number.isFinite(scoreObj.raw)) {
            d.sumRaw += scoreObj.raw;
            d.validRawCount++;
        }
        if (typeof scoreObj.std === 'number' && !Number.isNaN(scoreObj.std)) {
            d.sumStd += scoreObj.std;
            d.validStdCount++;
        }
        if (typeof scoreObj.pct === 'number' && !Number.isNaN(scoreObj.pct)) {
            d.sumPct += scoreObj.pct;
            d.validPctCount++;
        }
        // 등급은 정수 1~9만 센다(isValidGrade). 0·소수 등급을 평균에 넣지 않는다
        if (isValidGrade(scoreObj.grade)) {
            d.sumGrade += scoreObj.grade;
            d.validGradeCount++;
        }
    };

    data.forEach(s => {
        /* 1. 요약 통계용 점수 배열 */
        const korVal = s.korean?.[basis];
        const mathVal = s.math?.[basis];
        const engGrade = s.english?.grade;
        if (Number.isFinite(korVal)) korScores.push(korVal);
        if (Number.isFinite(mathVal)) mathScores.push(mathVal);
        if (isValidGrade(engGrade)) engGrades.push(engGrade);

        /* 2. 합산 점수 = 국어 + 수학 + 탐구평균 (상위N · 분포 공용)
         *    국어·수학이 없거나 탐구가 없으면(옵션을 켜지 않은 한) null 로 두어 순위·분포에서 뺀다 */
        const sum = compositeScore(s, basis, {includeNoInquiry});
        if (lacksInquiryOnly(s, basis)) noInquiryCount++;

        studentWithSums.push({s, sum});

        /* 3. 선택과목별 집계 */
        accSubject(korSubjectStats, s.korean?.subject, s.korean);
        accSubject(mathSubjectStats, s.math?.subject, s.math);
        // 탐구1·탐구2 과목이 같으면 한 과목으로 합쳐 한 번만 센다
        inquiryScores(s).forEach(d => accSubject(inqSubjectStats, d.subject, d));

        /* 4. 수능 최저 등급합 */
        csatSums.push(csatSumsOf(s));
    });

    return {
        basis, includeNoInquiry, noInquiryCount, basisMissing: !basisAvailable(data, basis),
        korScores, mathScores, engGrades,
        studentWithSums,
        korSubjectStats, mathSubjectStats, inqSubjectStats,
        csatSums
    };
}