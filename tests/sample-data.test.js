import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {convertRomanToNumber} from '../src/js/schema.js';
import {loadSampleData, ST} from '../src/js/main.js';
import {generateSampleExams, SAMPLE_KEYS, SAMPLE_SIZE} from '../src/js/sample.js';
import {linkStudents} from '../src/js/exams/identity.js';

const withOrder = (list) => list.map((e, order) => ({...e, order}));
const inqs = (s) => [s.inquiry1, s.inquiry2];

// 실제 화면 마크업 위에서 샘플을 불러온다. 차트는 jsdom 에서 그려지지 않으므로
// 리포트 그리기가 도중에 멈춰도 ST.exams 는 그 전에 채워진다.
it('샘플을 불러오면 3월·6월·9월 샘플 회차가 그 순서로 들어가고 9월을 본다', () => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    vi.spyOn(console, 'error').mockImplementation(() => {
    });
    try {
        loadSampleData();
        loadSampleData(); // 다시 불러오면 샘플 회차를 바꿀 뿐 늘지 않는다
    } catch {
        // 차트 그리기 실패는 이 시험의 관심사가 아니다
    }
    vi.restoreAllMocks();
    expect([...ST.exams].sort((a, b) => a.order - b.order).map(e => e.key)).toEqual(SAMPLE_KEYS);
    expect(ST.activeExamKey).toBe('9월 샘플');
    expect(document.getElementById('toast-msg').innerText).toBe(`샘플 3회차(학생 ${SAMPLE_SIZE}명)를 불러왔습니다.`);
});

it('씨앗 없이 두 번 만들면 다르고, 같은 씨앗이면 같다', () => {
    expect(generateSampleExams()).not.toEqual(generateSampleExams());
    expect(generateSampleExams(7)).toEqual(generateSampleExams(7));
});

it('같은 가상 학생들이 세 회차에 이어진다', () => {
    const {persons, conflicts} = linkStudents(withOrder(generateSampleExams(7)));
    expect(conflicts).toEqual([]);
    expect(persons.filter(p => Object.keys(p.entries).length === 3).length).toBe(SAMPLE_SIZE - 2);
});

it('특이한 경우가 들어 있다: 결시, 탐구 한 과목, 탐구 과목 바꿈, 합산 동점', () => {
    const exams = generateSampleExams(7);
    const [m3, m6, m9] = exams.map(e => e.students);
    expect(m3).toHaveLength(SAMPLE_SIZE);
    expect(m6).toHaveLength(SAMPLE_SIZE - 2);
    expect(m9).toHaveLength(SAMPLE_SIZE);
    // 탐구 한 과목만 본 학생: 과목명도 점수도 빈칸이다
    const one = m9.filter(s => s.inquiry2.raw === null);
    expect(one).toHaveLength(2);
    for (const s of one) expect(s.inquiry2).toEqual({subject: '', raw: null, std: null, pct: null, grade: null});
    // 탐구 과목을 바꾼 학생
    const changed = m9.filter((s, i) => s.inquiry2.subject && s.inquiry2.subject !== m3[i].inquiry2.subject);
    expect(changed).toHaveLength(1);
    // 합산(국어 + 수학 + 탐구평균) 동점
    const sum = (s) => s.korean.raw + s.math.raw + (s.inquiry1.raw + s.inquiry2.raw) / 2;
    const sums = m3.map(sum);
    expect(sums.length - new Set(sums).size).toBeGreaterThanOrEqual(2);
});

describe('값의 범위와 서로 맞음 (무작위 20번)', () => {
    const between = (v, lo, hi) => {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
    };
    // 한 회차 한 과목 안에서 표준점수가 높으면 백분위가 낮지 않고 등급이 나쁘지 않다
    const monotone = (list) => {
        const sorted = list.filter(x => x.raw !== null).sort((a, b) => a.std - b.std || a.raw - b.raw);
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].pct).toBeGreaterThanOrEqual(sorted[i - 1].pct);
            expect(sorted[i].grade).toBeLessThanOrEqual(sorted[i - 1].grade);
        }
    };
    it('모든 값이 범위 안이고 빈칸은 빈칸이다', () => {
        for (let run = 0; run < 20; run++) {
            for (const {students} of generateSampleExams()) {
                for (const s of students) {
                    for (const [sub, cMax, sMax] of [[s.korean, 76, 24], [s.math, 74, 26]]) {
                        between(sub.common_raw, 0, cMax);
                        between(sub.select_raw, 0, sMax);
                        between(sub.raw, 0, 100);
                        expect(sub.raw).toBe(sub.common_raw + sub.select_raw);
                        between(sub.std, 50, 150);
                        between(sub.pct, 0, 100);
                        between(sub.grade, 1, 9);
                    }
                    between(s.english.raw, 0, 100);
                    expect(s.english.grade).toBe(Math.min(9, 10 - Math.floor(s.english.raw / 10)) || 1);
                    between(s.hist.raw, 0, 50);
                    expect(s.hist.grade).toBe(Math.min(9, Math.max(1, 9 - Math.floor(s.hist.raw / 5))));
                    for (const q of inqs(s)) {
                        if (q.raw === null) {
                            expect([q.subject, q.std, q.pct, q.grade]).toEqual(['', null, null, null]);
                            continue;
                        }
                        between(q.raw, 0, 50);
                        between(q.std, 20, 80);
                        between(q.pct, 0, 100);
                        between(q.grade, 1, 9);
                        // 라틴 문자 I 로 끝나면 내보내기 변환(Ⅰ→1)이 먹지 않는다
                        expect(q.subject).not.toMatch(/[A-Za-z]$/);
                        if (/(물리학|화학|생명과학|지구과학)/.test(q.subject)) expect(convertRomanToNumber(null, q.subject)).toMatch(/1$/);
                    }
                    // 탐구1·탐구2 는 서로 다른 과목이다
                    expect(s.inquiry2.subject).not.toBe(s.inquiry1.subject);
                    expect(s.fl2.raw).toBeNull();
                }
                monotone(students.map(s => s.korean));
                monotone(students.map(s => s.math));
                const bySubject = new Map();
                students.flatMap(inqs).forEach(q => bySubject.set(q.subject, [...(bySubject.get(q.subject) ?? []), q]));
                bySubject.forEach(monotone);
            }
        }
    }, 120000);
});
