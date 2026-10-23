import {compositeScore, inquiryAvg} from '../core/aggregate.js';
import {sortedExams} from '../exams/examStore.js';
import {roundHalfUp} from '../utils.js';

/* ───────────────────────────────────────────
   § 회차별 통계 (계산만, 화면 없음)
   가로축은 언제나 회차 순서(order)다. 값이 없는 회차는 null 로 두고 0 으로 채우지 않는다
   (빈칸은 0점이 아니다). 합산은 국어 + 수학 + 탐구평균(core/aggregate.js)이다.
─────────────────────────────────────────── */

const avg = (vals) => {
    const v = vals.filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** 한 회차의 전교 요약: 과목별 평균, 합산 평균, 합산 대상 인원 */
export function examSummary(exam, basis, {includeNoInquiry = false} = {}) {
    const s = exam.students;
    const totals = s.map(x => compositeScore(x, basis, {includeNoInquiry}));
    return {
        key: exam.key,
        students: s.length,
        ranked: totals.filter(Number.isFinite).length,
        total: avg(totals),
        kor: avg(s.map(x => x.korean?.[basis])),
        math: avg(s.map(x => x.math?.[basis])),
        inq: avg(s.map(x => inquiryAvg(x, basis))),
        engGrade: avg(s.map(x => x.english?.grade)),
    };
}

/** 모든 회차의 전교 요약(회차 순서대로) */
export function schoolTrend(exams, basis, options) {
    return sortedExams(exams).map(e => examSummary(e, basis, options));
}

/**
 * 한 회차 안 합산 석차(공동순위 1,1,3). 학생 위치 → 석차, 합산이 없으면 없음.
 * 비교 키는 소수 6자리로 반올림한다(2진 오차로 같은 점수가 나뉘지 않게)
 */
export function examRanks(exam, basis, options) {
    const keyed = exam.students.map((s, i) => {
        const v = compositeScore(s, basis, options);
        return {i, key: v === null ? null : roundHalfUp(v, 6)};
    }).filter(x => x.key !== null).sort((a, b) => b.key - a.key);
    const ranks = new Map();
    keyed.forEach((x, n) => ranks.set(x.i, n > 0 && keyed[n - 1].key === x.key ? ranks.get(keyed[n - 1].i) : n + 1));
    return {ranks, of: keyed.length};
}

/**
 * 한 학생의 회차별 성적. person 은 exams/identity.js 의 linkStudents 결과 한 명({name, entries}).
 * 그 회차에 이 학생이 없으면 student 가 null 이다(회차는 빠지지 않고 빈칸으로 남는다).
 */
export function personTrend(person, exams, basis, options) {
    return sortedExams(exams).map(exam => {
        const index = person.entries[exam.key];
        const s = index === undefined ? null : exam.students[index];
        if (!s) return {key: exam.key, student: null};
        const {ranks, of} = examRanks(exam, basis, options);
        return {
            key: exam.key,
            student: s,
            total: compositeScore(s, basis, options),
            kor: s.korean?.[basis] ?? null,
            math: s.math?.[basis] ?? null,
            inq: inquiryAvg(s, basis),
            engGrade: s.english?.grade ?? null,
            rank: ranks.get(index) ?? null,
            of,
        };
    });
}
