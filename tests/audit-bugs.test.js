import {describe, expect, it} from 'vitest';
import {identityKeys} from '../src/js/exams/identity.js';
import {nextGradeGap} from '../src/js/trend/personal.js';
import {computeRenderCache} from '../src/js/report/report-cache.js';
import {examSummary} from '../src/js/trend/trend.js';
import {withUnit} from '../src/js/utils.js';
import {entryOrder} from '../src/js/ui/grid/filters.js';

/* 적대적 코드 감사(2026-10-24)에서 재현된 버그. 합성 자료만 쓴다. */
const blank = (subject = '') => ({subject, raw: null, std: null, pct: null, grade: null});
const stu = (o) => ({korean: blank(), math: blank(), english: {grade: null}, inquiry1: blank(), inquiry2: blank(), hist: {grade: null}, ...o});

describe('감사 버그 재현', () => {
    it('탐구1이 과목명만 있고 점수가 없어도, 같은 과목의 탐구2 점수로 다음 등급을 추정한다', () => {
        const me = stu({inquiry1: {subject: '물리학Ⅰ', raw: 30, grade: 4}});
        const other = stu({inquiry1: blank('물리학Ⅰ'), inquiry2: {subject: '물리학Ⅰ', raw: 40, grade: 3}});
        expect(nextGradeGap({students: [me, other]}, 'inquiry1', me)).toEqual({kind: 'ok', target: 3, gap: 10, min: 40});
    });

    it('등급 0·소수는 영어 상위 20%·선택과목 평균 등급·전교 영어 등급 평균에 들어가지 않는다', () => {
        const data = [
            stu({english: {raw: 85, grade: 0}, korean: {subject: '화법과 작문', raw: 80, grade: 0}}),
            stu({english: {raw: 90, grade: 2}, korean: {subject: '화법과 작문', raw: 70, grade: 3}}),
        ];
        const c = computeRenderCache(data, 'raw');
        expect(c.engGrades).toEqual([2]);
        expect(c.korSubjectStats['화법과 작문'].validGradeCount).toBe(1);
        expect(examSummary({key: '6', students: data}, 'raw').engGrade).toBe(2);
        // 등급 기준의 국어 평균도 같은 규칙(0 은 제외하고 3 만)
        expect(examSummary({key: '6', students: data}, 'grade').kor).toBe(3);
    });

    it('번호·반을 「01」(글자)과 1(숫자)로 다르게 적어도 같은 학생 키가 된다', () => {
        const a = identityKeys({grade_year: '3', class: '01', number: '05', name: '가'});
        const b = identityKeys({grade_year: 3, class: 1, number: 5, name: '가'});
        expect(a.some(k => b.includes(k))).toBe(true);
        const c = identityKeys({grade_year: '3학년', class: '1반', number: '5번', name: '가'});
        expect(c.some(k => b.includes(k))).toBe(true);
        // 숫자가 아닌 반 이름은 그대로 둔다
        expect(identityKeys({grade_year: '3', class: '가반', number: '5'}).some(k => k.includes('가반'))).toBe(true);
    });
});

describe('2차 적대 감사 버그 재현', () => {
    it('반·번호에 단위가 이미 붙어 있으면 다시 붙이지 않는다', () => {
        expect(withUnit('1', '반')).toBe('1반');
        expect(withUnit('1반', '반')).toBe('1반');
        expect(withUnit('5번', '번')).toBe('5번');
        expect(withUnit('', '번')).toBe('');
    });
    it('숫자 열 값 목록에서도 (빈칸)은 맨 뒤다', () => {
        const order = entryOrder({key: 'eng', numeric: true, type: 'number'});
        const entries = [{value: 3, label: '3'}, {value: null, label: '(빈칸)'}, {value: 1, label: '1'}];
        expect([...entries].sort(order).map(e => e.label)).toEqual(['1', '3', '(빈칸)']);
    });
});

describe('김영일 내보내기 학번', async () => {
    const {SCHEMAS} = await import('../src/js/schema.js');
    const make = Object.values(SCHEMAS).find(sc => sc.customGetters?.student_id)?.customGetters.student_id;
    it('반·번호·학년에 단위가 붙어 있어도 그 숫자로 학번을 만든다', () => {
        expect(make({grade_year: '3학년', class: '1반', number: '5번'}, '')).toBe('301005');
        expect(make({grade_year: 3, class: 1, number: 5}, '')).toBe('301005');
        expect(make({grade_year: '3', class: '가반', number: '5'}, '')).toBe('300005');
    });
});

describe('3차 적대 감사 버그 재현', async () => {
    const {changeVsPrev} = await import('../src/js/trend/personal.js');
    const sc = (subject, pct, grade, raw = 40) => ({subject, raw, std: null, pct, grade});
    const row = (key, s) => ({key, student: s});
    it('앞 회차에 과목명 없는 탐구 칸이 섞여 있어도 과목명으로 짝을 찾는다', () => {
        const rows = [
            row('3', stu({inquiry1: sc('생활과 윤리', 80, 3), inquiry2: {subject: '', raw: 0, pct: null, grade: null}})),
            row('6', stu({inquiry1: sc('사회·문화', 70, 4), inquiry2: sc('생활과 윤리', 85, 2)})),
        ];
        expect(changeVsPrev(rows, 'inquiry1')[1].note).toBe('changed');
        expect(changeVsPrev(rows, 'inquiry2')[1]).toEqual({pct: 5, grade: 1, note: null});
    });
    it('양식마다 다른 과목명 표기(공백·Ⅰ/1)는 같은 과목으로 본다', () => {
        const rows = [
            row('3', stu({korean: sc('화법과작문', 70, 4), inquiry1: sc('물리학1', 60, 5)})),
            row('6', stu({korean: sc('화법과 작문', 80, 3), inquiry1: sc('물리학Ⅰ', 70, 4)})),
        ];
        expect(changeVsPrev(rows, 'korean')[1]).toEqual({pct: 10, grade: 1, note: null});
        expect(changeVsPrev(rows, 'inquiry1')[1]).toEqual({pct: 10, grade: 1, note: null});
    });
});

describe('CSV 셀은 글자 그대로 읽는다', async () => {
    const {loadWorkbook} = await import('../src/js/ingest/files.js');
    it('82%·1,234·3/4·0105 를 SheetJS 가 숫자·날짜로 미리 바꾸지 않는다', async () => {
        const csv = '아이디,값1,값2,값3\n0105,82%,"1,234",3/4\n';
        const wb = await loadWorkbook({name: 't.csv', bytes: new TextEncoder().encode(csv)});
        const ws = wb.worksheets[0];
        expect([2, 3, 4].map(c => ws.getRow(2).getCell(c).value)).toEqual(['82%', '1,234', '3/4']);
        expect(ws.getRow(2).getCell(1).value).toBe('0105');
    });
});

describe('김영일 학번으로 반·번호 회차와 잇기', async () => {
    const {linkStudents} = await import('../src/js/exams/identity.js');
    it('학번 301005 는 3학년 1반 5번과 같은 학생이다', () => {
        const kim = identityKeys({grade_year: '3', student_id: '301005', name: '갑'});
        const dae = identityKeys({grade_year: 3, class: 1, number: 5, name: '갑'});
        expect(kim.some(k => dae.includes(k))).toBe(true);
    });
    it('학년 칸과 학번 첫 자리가 다르거나, 반·번호가 있으면 계산하지 않는다', () => {
        expect(identityKeys({grade_year: '2', student_id: '301005'}).some(k => k.startsWith('cn:'))).toBe(false);
        expect(identityKeys({grade_year: '3', class: 2, number: 7, student_id: '301005'}).filter(k => k.startsWith('cn:'))).toEqual(['cn:3|2|7']);
        expect(identityKeys({student_id: 'S0105'}).some(k => k.startsWith('cn:'))).toBe(false);
    });
    it('두 회차가 실제로 한 사람으로 이어진다', () => {
        const exams = [
            {key: '3월', order: 0, students: [{grade_year: 3, class: 1, number: 5, name: '갑'}]},
            {key: '6월', order: 1, students: [{grade_year: 3, student_id: '301005', name: '갑'}]},
        ];
        const {persons} = linkStudents(exams);
        expect(persons).toHaveLength(1);
    });
});
