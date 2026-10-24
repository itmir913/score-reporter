import {inquiryScores} from '../utils.js';

const BASIS_LABEL = {raw: '원점수', std: '표준점수', pct: '백분위'};

/* ───────────────────────────────────────────
   § 합산 점수 = 국어 + 수학 + 탐구평균 (CLAUDE.md 점수 해석 원칙)
   탐구를 한 과목만 본 학생이 탐구 두 과목을 더하는 방식에서 손해를 보거나
   네 과목이 다 있어야 하는 규칙에 걸려 빠지던 것을 막는다.
─────────────────────────────────────────── */

/** 이 기준(raw·std·pct)의 탐구평균. 값이 있는 탐구가 없으면 null.
 *  과목명이 같은 두 칸은 자료 중복이므로 한 과목으로 본다(그 기준 값이 탐구1에 없으면 탐구2 값). */
export function inquiryAvg(s, basis) {
    const vals = inquiryScores(s).map(d => d[basis]).filter(Number.isFinite);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** 합산 점수. 국어·수학 중 하나라도 없으면 null.
 *  탐구 값이 하나도 없으면 null 이지만, includeNoInquiry 면 국어 + 수학이다(탐구를 0점으로 보지 않는다). */
export function compositeScore(s, basis, {includeNoInquiry = false} = {}) {
    const kor = s?.korean?.[basis];
    const math = s?.math?.[basis];
    if (!Number.isFinite(kor) || !Number.isFinite(math)) return null;
    const inq = inquiryAvg(s, basis);
    if (inq === null) return includeNoInquiry ? kor + math : null;
    return kor + math + inq;
}

/** 국어·수학은 있는데 탐구 값이 하나도 없는 학생인가 — 「탐구 미응시 N명」에 세는 대상 */
export function lacksInquiryOnly(s, basis) {
    return Number.isFinite(s?.korean?.[basis]) && Number.isFinite(s?.math?.[basis]) && inquiryAvg(s, basis) === null;
}

/** 합산 표·분포 아래에 붙이는 탐구 미응시 안내. 해당 학생이 없으면 빈 문자열 */
export function noInquiryNote(count, includeNoInquiry) {
    if (!count) return '';
    return includeNoInquiry
        ? `탐구 미응시 ${count}명 포함 — 국어+수학만으로 계산되어 다른 학생과 같은 척도가 아닙니다.`
        : `탐구 미응시 ${count}명은 합산에서 제외했습니다.`;
}

/** 이 회차 자료에 이 기준(raw·std·pct)의 국어·수학·탐구 값이 하나라도 있는가 */
export function basisAvailable(data, basis) {
    return (data || []).some(s => ['korean', 'math', 'inquiry1', 'inquiry2'].some(subj => Number.isFinite(s?.[subj]?.[basis])));
}

/** 선택한 기준의 값이 이 회차에 없을 때의 안내. 숫자 자리는 모두 DASH 로 가리고 다른 기준 값으로 대신하지 않는다 */
export function missingBasisMessage(basis) {
    return `이 회차에는 ${BASIS_LABEL[basis]}가 없어 표시할 수 없습니다.`;
}
