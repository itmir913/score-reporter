/* ───────────────────────────────────────────
   § 등급·점수 상한
   점수 체계의 상·하한을 이곳에만 둔다. 범위를 데이터에서 계산하지 않는다.
   수능·모의고사는 9등급제다(2028 수능도 9등급 유지). 학년마다 등급제가 달라지면
   이 파일의 값과 isValidGrade 만 고치면 되도록 다른 파일은 여기서 가져다 쓴다.
─────────────────────────────────────────── */

export const GRADE_MIN = 1;
export const GRADE_MAX = 9;

export const PCT_MIN = 0;
export const PCT_MAX = 100;

/** 표준점수 분포 차트의 상한. 10점 단위 구간으로 나눈다 */
export const STD_MAX = 200;
export const SCORE_BIN = 10;

/** 원점수 만점. 값 범위 교차검증(formatMatch)에 쓴다 */
export const RAW_MAX = {korean: 100, math: 100, english: 100, inquiry1: 50, inquiry2: 50, hist: 50, fl2: 50};

/** 학생 강약점: 이웃한 두 과목의 백분위 차가 이 값 이하이면 「비슷함(≈)」으로 적는다.
 *  모의고사 한 번의 측정 오차가 이 정도라 그 안의 차이로 강약을 나누지 않는다 */
export const STRENGTH_SIMILAR = 5;

/** 수능최저 누적표의 마지막 열(n합 ≤ 이 값까지 센다) */
export const CSAT_SUM_MAX = 15;

/** 등급으로 쓸 수 있는 값인가: GRADE_MIN~GRADE_MAX 정수 */
export function isValidGrade(v) {
    return Number.isInteger(v) && v >= GRADE_MIN && v <= GRADE_MAX;
}
