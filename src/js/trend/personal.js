import {hasScore, inquiryScores, roundHalfUp, sameInquirySubject} from '../utils.js';
import {isValidGrade} from '../core/limits.js';

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
