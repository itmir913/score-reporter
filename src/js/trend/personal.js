import {hasScore, inquiryScores, roundHalfUp, sameInquirySubject} from '../utils.js';
import {GRADE_MIN, isValidGrade, STRENGTH_SIMILAR} from '../core/limits.js';

/* ───────────────────────────────────────────
   § 학생 한 명 안에서의 비교 (통계 탭 · 학생별)
   다른 학생과의 순위가 아니라 그 학생의 과목끼리, 회차끼리 견준다(소유자 결정 2026-10-24).
   화면이 없는 순수 함수만 둔다. 결과는 저장하지 않고 그릴 때마다 계산한다.
─────────────────────────────────────────── */

/** 영역 줄. 영어·한국사는 절대평가라 원점수·등급만 있다 */
export const AREAS = [['korean', '국어'], ['math', '수학'], ['english', '영어'], ['inquiry1', '탐구1'], ['inquiry2', '탐구2'], ['hist', '한국사']];
/** 백분위가 있는 영역(영어·한국사는 등급만 견준다) */
const PCT_AREAS = new Set(['korean', 'math', 'inquiry1', 'inquiry2']);
const INQUIRY = new Set(['inquiry1', 'inquiry2']);

/** 원점수: 원점수 열이 없으면 공통+선택. parser.js 의 sumParts 와 같은 소유자 예외다(CLAUDE.md) */
export function rawOf(d) {
    if (!d) return null;
    if (Number.isFinite(d.raw)) return d.raw;
    if (Number.isFinite(d.common_raw) || Number.isFinite(d.select_raw)) return (d.common_raw || 0) + (d.select_raw || 0);
    return null;
}

/** 탐구1·2가 같은 과목인 학생의 탐구2 줄. 탐구1 줄에 합쳐 적는다 */
export const MERGED = 'merged';

/**
 * 영역 하나의 점수. 탐구1·2가 같은 과목이면 탐구1 이 합친 점수(inquiryScores)이고, 탐구2 는 MERGED 다.
 * @returns {object|null|'merged'}
 */
export function areaScore(s, area) {
    if (!s) return null;
    if (INQUIRY.has(area) && sameInquirySubject(s)) return area === 'inquiry1' ? inquiryScores(s)[0] : MERGED;
    return s[area] ?? null;
}

const named = (d) => typeof d?.subject === 'string' && d.subject.trim() !== '';

/**
 * 앞 회차에서 비교할 짝을 찾는다. 바로 앞 회차가 아니라 그 영역을 응시한 가장 가까운 앞 회차다.
 * @returns {{score: object}|{changed: true}|null} null 이면 첫 응시
 */
function previousOf(rows, i, area, cur) {
    for (let j = i - 1; j >= 0; j -= 1) {
        const s = rows[j].student;
        if (!s) continue;
        if (INQUIRY.has(area)) {
            const prev = [areaScore(s, 'inquiry1'), areaScore(s, 'inquiry2')].filter(d => d && d !== MERGED && hasScore(d));
            if (prev.length === 0) continue;
            // 두 회차 모두 과목명이 있으면 과목명으로 짝을 찾는다(탐구1·2 칸 순서가 바뀌어도 같은 과목끼리)
            if (named(cur) && prev.every(named)) {
                const same = prev.find(d => d.subject === cur.subject);
                return same ? {score: same} : {changed: true};
            }
            // 과목명이 없는 쪽이 있으면 같은 칸끼리 견준다
            const slot = areaScore(s, area);
            if (slot && slot !== MERGED && hasScore(slot)) return {score: slot};
            continue;
        }
        const prev = s[area];
        if (!hasScore(prev)) continue;
        // 국어·수학은 선택과목이 바뀌면 변화가 아니라 다른 과목이다. 과목명이 없는 쪽이 있으면 칸끼리 견준다
        if (named(cur) && named(prev) && cur.subject !== prev.subject) return {changed: true};
        return {score: prev};
    }
    return null;
}

/**
 * 회차마다 직전 응시 회차 대비 변화.
 * - pct: 백분위 차(이번 − 앞). 영어·한국사는 내지 않는다
 * - grade: 등급 차(앞 − 이번). 양수면 좋아졌다(등급 숫자가 줄었다). 두 등급이 모두 정수 등급일 때만
 * - note: 'first'(첫 응시) · 'changed'(과목 바뀜) · 'merged'(탐구1과 같은 과목) · 'absent'(이 회차 미응시) · 'noPct'(백분위 없음)
 * 원점수 차는 내지 않는다. 회차마다 난도가 달라 뜻이 없다.
 * @param {{student: object|null}[]} rows personTrend 결과(회차 순서)
 * @returns {({pct: number|null, grade: number|null, note: string|null}|null)[]} 학생이 없는 회차는 null
 */
export function changeVsPrev(rows, area) {
    return rows.map((r, i) => {
        if (!r.student) return null;
        const cur = areaScore(r.student, area);
        if (cur === MERGED) return {pct: null, grade: null, note: 'merged'};
        if (!hasScore(cur)) return {pct: null, grade: null, note: 'absent'};
        const prev = previousOf(rows, i, area, cur);
        if (!prev) return {pct: null, grade: null, note: 'first'};
        if (prev.changed) return {pct: null, grade: null, note: 'changed'};
        const p = prev.score;
        const grade = isValidGrade(cur.grade) && isValidGrade(p.grade) ? p.grade - cur.grade : null;
        if (!PCT_AREAS.has(area)) return {pct: null, grade, note: null};
        const hasPct = Number.isFinite(cur.pct) && Number.isFinite(p.pct);
        return {pct: hasPct ? cur.pct - p.pct : null, grade, note: hasPct ? null : 'noPct'};
    });
}

/**
 * 한 회차 안의 강약점. 표는 성적표와 같은 영역 차례(국어·수학·영어·탐구1·탐구2·한국사)로 늘어놓는다.
 * 국어·수학·탐구는 백분위로 견주고(원점수는 만점이 달라 견줄 수 없다), 영어·한국사는 등급만 적는다.
 * 응시하지 않은 영역은 제외한다(빈칸은 0점이 아니다).
 * - items: 영역 차례. pct 가 있는 줄의 similar 는 백분위 차가 STRENGTH_SIMILAR 이하인 다른 과목들(표시만, 묶지 않음)
 * - inquiryGap: 탐구 두 과목의 백분위 차가 STRENGTH_SIMILAR 를 넘으면 그 차, 아니면 null
 */
export function strengths(student) {
    const items = [];
    for (const [area, label] of AREAS) {
        const d = areaScore(student, area);
        if (d === MERGED || !hasScore(d)) continue;
        const hasPct = PCT_AREAS.has(area) && Number.isFinite(d.pct);
        items.push({area, label, subject: d.subject ?? '', pct: hasPct ? d.pct : null,
            grade: isValidGrade(d.grade) ? d.grade : null, noPct: PCT_AREAS.has(area) && !hasPct});
    }
    const withPct = items.filter(x => x.pct !== null);
    for (const x of withPct) {
        x.similar = withPct.filter(y => y !== x && Math.abs(x.pct - y.pct) <= STRENGTH_SIMILAR)
            .map(y => ({name: y.subject || y.label, diff: Math.abs(x.pct - y.pct)}));
    }
    const inq = withPct.filter(x => INQUIRY.has(x.area));
    const gap = inq.length === 2 ? Math.abs(inq[0].pct - inq[1].pct) : null;
    return {items, inquiryGap: gap !== null && gap > STRENGTH_SIMILAR ? gap : null};
}

/** 회차별 수능최저에 적는 영역(국·수·영·탐1·탐2). 탐구 병합 학생은 탐구1 에 한 과목만 */
export const CSAT_AREAS = [['korean', '국어'], ['math', '수학'], ['english', '영어'], ['inquiry1', '탐구1'], ['inquiry2', '탐구2']];

/**
 * 회차마다 수능최저 n합. 합은 sumsOf(student) — 수능최저 탭의 과목 선택을 따르는 csatSumsOf — 가 낸다.
 * 결시·과목 부족은 그 합이 null 이다(9등급·0으로 채우지 않는다).
 * @returns {({absent: true}|{grades: Record<string, number|null>, sums: object, noGrade: boolean})[]}
 */
export function csatTimeline(rows, sumsOf) {
    return rows.map(r => {
        if (!r.student) return {absent: true};
        const grades = Object.fromEntries(CSAT_AREAS.map(([k]) => {
            const d = areaScore(r.student, k);
            return [k, d && d !== MERGED && isValidGrade(d.grade) ? d.grade : null];
        }));
        return {grades, sums: sumsOf(r.student), noGrade: Object.values(grades).every(g => g === null)};
    });
}

/** 같은 과목을 본 학생의 그 영역 점수. 국어·수학은 같은 선택과목, 탐구는 같은 과목명(탐구1·2 어디든), 영어·한국사는 전원 */
function sameSubjectScore(s, area, subject) {
    if (area === 'english' || area === 'hist') return s[area] ?? null;
    // 과목명만 있고 점수가 없는 칸은 응시가 아니다. 점수가 있는 칸을 찾는다
    if (INQUIRY.has(area)) return inquiryScores(s).find(d => d?.subject === subject && hasScore(d)) ?? null;
    return s[area]?.subject === subject ? s[area] : null;
}

/**
 * 다음 등급까지 몇 점인지 어림한다(소유자 결정 2026-10-24).
 * 같은 회차에서 같은 과목을 본 학생 중 나보다 등급이 높은 학생의 원점수 최솟값을 구한다. 그 점수에 닿으면
 * 한 등급 위였던 학생이 있으므로 「최대 (그 점수 − 내 점수)점」이다. 집단 크기 같은 문턱은 두지 않는다.
 * 모든 영역(영어·한국사 포함)이 같은 규칙이다.
 * @returns {{kind: 'ok', target: number, gap: number, min: number}|{kind: 'top'}|{kind: 'merged'}|{kind: 'fail', reason: string}}
 */
export function nextGradeGap(exam, area, student) {
    const me = areaScore(student, area);
    if (me === MERGED) return {kind: 'merged'};
    if (!me || !isValidGrade(me.grade)) return {kind: 'fail', reason: '등급 없음'};
    const myRaw = rawOf(me);
    if (myRaw === null) return {kind: 'fail', reason: '원점수 없음'};
    if (me.grade === GRADE_MIN) return {kind: 'top'};
    const needsSubject = area !== 'english' && area !== 'hist';
    if (needsSubject && !named(me)) return {kind: 'fail', reason: '과목명 없음'};
    let min = null;
    for (const s of exam.students) {
        const d = sameSubjectScore(s, area, me.subject);
        if (!d || !isValidGrade(d.grade) || d.grade >= me.grade) continue;
        const raw = rawOf(d);
        if (raw !== null && (min === null || raw < min)) min = raw;
    }
    if (min === null) return {kind: 'fail', reason: '더 높은 등급 학생 없음'};
    // 내 점수 이하에서 더 높은 등급이 나왔다. 국어·수학은 공통·선택 구성 차이일 수 있다
    if (min <= myRaw) return {kind: 'fail', reason: '원점수와 등급이 어긋남'};
    return {kind: 'ok', target: me.grade - 1, gap: min - myRaw, min};
}

/** 「다음 등급까지」 칸의 글자 */
export function gapText(r) {
    if (r.kind === 'ok') return `${r.target}등급까지 최대 ${r.gap}점`;
    if (r.kind === 'top') return '최고 등급';
    if (r.kind === 'merged') return '탐구1과 같은 과목';
    return `추론 불가(${r.reason})`;
}

/* 낱말 뒤의 「과/와」. 받침이 있으면 「과」. 로마 숫자로 끝나는 과목명(물리학Ⅰ·Ⅱ)은 읽는 소리(일·이)로 본다 */
const 받침소리 = {'Ⅰ': true, 'Ⅱ': false, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false, '0': true};
export function 과와(word) {
    const last = String(word ?? '').trim().slice(-1);
    if (last in 받침소리) return 받침소리[last] ? '과' : '와';
    const code = last.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) return code % 28 ? '과' : '와';
    return '와';
}

const arrow = (d) => (d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '변화 없음');

/** 「직전 대비」 칸의 글자 */
export function changeText(change) {
    if (!change) return '';
    if (change.note === 'first') return '첫 응시';
    if (change.note === 'changed') return '과목 바뀜';
    if (change.note === 'merged') return '탐구1과 같은 과목';
    if (change.note === 'absent') return '';
    const parts = [];
    if (Number.isFinite(change.pct)) parts.push(`백분위 ${arrow(roundHalfUp(change.pct, 1))}`);
    if (Number.isFinite(change.grade)) parts.push(`등급 ${arrow(change.grade)}`);
    if (change.note === 'noPct') parts.push('백분위 없음');
    return parts.join(' · ');
}
