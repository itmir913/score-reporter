import {describe, expect, it} from 'vitest';
import {
    addExam, compareExamKeys, fileHashHex, moveExam, removeExam, renameExam, sortedExams, suggestExamKey,
} from '../src/js/exams/examStore.js';
import {identityKeys, linkStudents} from '../src/js/exams/identity.js';

const exam = (key, students = []) => ({key, formatId: 'univ-2015-grade3', fileName: `${key}.xlsx`, fileHash: 'h', students});
const keys = (list) => sortedExams(list).map(e => e.key);
const build = (...ks) => ks.reduce((list, k) => addExam(list, exam(k)), []);

describe('회차 목록', () => {
    it('연월은 시간순 자리를 제안받는다', () => {
        expect(keys(build('2026-05', '2026-03', '2026-04'))).toEqual(['2026-03', '2026-04', '2026-05']);
    });

    it('숫자만 쓴 키(3, 4)도 크기순이고, 글자로 된 키(사설)는 숫자 뒤에 온다', () => {
        expect(keys(build('4', '사설', '3', '10'))).toEqual(['3', '4', '10', '사설']);
    });

    it('월 이름은 글자가 아니라 숫자 크기로 정렬한다(1월 → 2월 → 9월 → 10월 → 11월)', () => {
        expect(keys(build('11월', '2월', '10월', '1월', '9월'))).toEqual(['1월', '2월', '9월', '10월', '11월']);
        expect(keys(build('10', '9월', '1'))).toEqual(['1', '9월', '10']);
    });

    it('사람이 옮긴 순서는 다음 회차를 넣어도 유지된다', () => {
        let list = build('3', '4', '사설');
        list = moveExam(list, '사설', -1); // 3, 사설, 4
        expect(keys(list)).toEqual(['3', '사설', '4']);
        list = addExam(list, exam('5'));
        expect(keys(list)).toEqual(['3', '사설', '4', '5']);
        expect(sortedExams(list).map(e => e.order)).toEqual([0, 1, 2, 3]);
    });

    it('끝에서 더 옮기면 그대로다', () => {
        expect(keys(moveExam(build('3', '4'), '3', -1))).toEqual(['3', '4']);
    });

    it('같은 키는 막는다(공백·정규화 차이도 같은 키)', () => {
        const list = build('사설');
        expect(() => addExam(list, exam(' 사설 '))).toThrow('이미 있습니다');
        expect(() => addExam(list, exam(''))).toThrow('이름을 입력');
        expect(() => renameExam(build('3', '4'), '4', '3')).toThrow('이미 있습니다');
    });

    it('이름을 바꿔도 순서는 그대로, 지우면 순서를 다시 매긴다', () => {
        let list = renameExam(build('3', '4', '5'), '4', '4월');
        expect(keys(list)).toEqual(['3', '4월', '5']);
        list = removeExam(list, '3');
        expect(sortedExams(list).map(e => [e.key, e.order])).toEqual([['4월', 0], ['5', 1]]);
    });

    it('회차 이름 전체를 자연 정렬한다(숫자를 따로 꺼내지 않는다)', () => {
        const sorted = ['3학년_10월', '사설', '3학년_9월', '2026-04', '2026-03'].sort(compareExamKeys);
        expect(sorted).toEqual(['3학년_9월', '3학년_10월', '2026-03', '2026-04', '사설']);
    });

    it.each([
        ['2026-03 모의고사.xlsx', '2026-03'],
        ['2026.4 학력평가.xlsx', '2026-04'],
        ['2026년 6월 모평.xls', '2026-06'],
        ['3월 학평.xlsx', '3월'],
        ['사설 모의고사.xlsx', '사설'],
        ['성적.xlsx', ''],
        ['13월.xlsx', ''],
    ])('파일 이름에서 회차 이름을 제안한다: %s → %s', (name, key) => {
        expect(suggestExamKey(name)).toBe(key);
    });

    it('파일 해시는 내용이 같으면 같다', () => {
        const a = fileHashHex(new Uint8Array([1, 2, 3]));
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(fileHashHex(new Uint8Array([1, 2, 3]))).toBe(a);
        expect(fileHashHex(new Uint8Array([1, 2, 4]))).not.toBe(a);
    });
});

const st = (o) => ({grade_year: '3', class: '', number: '', student_id: '', name: '', ...o});

describe('동일인 연결', () => {
    it('학번이 있으면 학번, 없으면 학년+반+번호로 잇는다. 이름의 공백 차이는 같다고 본다', () => {
        const exams = build('3', '4').map(e => e.key === '3'
            ? {...e, students: [st({class: '1', number: '1', name: '가상 일'}), st({student_id: 'A1', name: '가상이'})]}
            : {...e, students: [st({student_id: 'A1', name: '가상이'}), st({class: '1', number: '1', name: '가상일'})]});
        const {persons, conflicts} = linkStudents(exams);
        expect(conflicts).toEqual([]);
        expect(persons.map(p => p.entries)).toEqual([{3: 0, 4: 1}, {3: 1, 4: 0}]);
    });

    it('키가 같으면 이름이 달라도(외국인 학생 표기 등) 같은 학생으로 잇는다', () => {
        const exams = build('3', '4').map(e => ({...e, students: [st({class: '1', number: '1', name: e.key === '3' ? '가' : '나'})]}));
        const {persons, conflicts} = linkStudents(exams);
        expect(persons.map(p => p.entries)).toEqual([{3: 0, 4: 0}]);
        expect(conflicts).toEqual([]);
    });

    it('이름이 비어 있어도 키가 같으면 잇는다', () => {
        const exams = build('3', '4').map(e => ({...e, students: [st({student_id: '7', name: e.key === '3' ? '' : '가'})]}));
        expect(linkStudents(exams).persons).toHaveLength(1);
    });

    it('학년이 다르면 같은 반·번호여도 잇지 않는다', () => {
        const exams = build('3', '4').map(e => ({...e, students: [st({grade_year: e.key === '3' ? '2' : '3', class: '1', number: '1', name: '가'})]}));
        expect(linkStudents(exams).persons).toHaveLength(2);
    });

    it('한 회차 안에서 키가 겹치면(전학생 등) 그 키로 잇지 않고 알린다', () => {
        const exams = build('3', '4').map(e => e.key === '3'
            ? {...e, students: [st({class: '1', number: '1', name: '가'}), st({class: '1', number: '1', name: '가'})]}
            : {...e, students: [st({class: '1', number: '1', name: '가'})]});
        const {persons, conflicts} = linkStudents(exams);
        expect(persons).toHaveLength(3);
        expect(conflicts.map(c => [c.examKey, c.index])).toEqual([['3', 0], ['3', 1]]);
    });

    it('두 키가 다른 회차의 서로 다른 학생을 가리키면(모호) 어느 쪽도 잇지 않는다', () => {
        // 3월: 학번 A1 = 1반1번 가, 1반2번 가(학번 없음). 4월: 학번 A1 이 1반2번 가
        const exams = build('3', '4').map(e => e.key === '3'
            ? {...e, students: [st({student_id: 'A1', class: '1', number: '1', name: '가'}), st({class: '1', number: '2', name: '가'})]}
            : {...e, students: [st({student_id: 'A1', class: '1', number: '2', name: '가'})]});
        const {persons, conflicts} = linkStudents(exams);
        expect(persons).toHaveLength(3);
        expect(conflicts).toHaveLength(3);
        expect(conflicts.every(c => c.reason.includes('둘 이상'))).toBe(true);
    });

    it('한 학생이 다른 회차에서 학번으로 한 명, 반·번호로 다른 한 명과 맞으면 잇지 않는다', () => {
        // 감사 반례: A 의 P(학번 100, 3반 5번) ↔ B 의 Q1(학번 100) · Q2(3반 5번)
        const exams = build('3', '4').map(e => e.key === '3'
            ? {...e, students: [st({student_id: '100', class: '3', number: '5', name: '김'})]}
            : {...e, students: [st({student_id: '100', name: '김'}), st({class: '3', number: '5', name: '김'})]});
        const {persons} = linkStudents(exams);
        expect(persons.every(p => Object.keys(p.entries).length === 1)).toBe(true);
    });

    it('결과는 회차를 넣은 순서와 무관하다', () => {
        // 학번 100 이 회차마다 이름 표기가 다르다: '이', '김', '김'
        const names = {'2026-03': '이', '2026-04': '김', '2026-05': '김'};
        const make = (order) => order.reduce((list, k) => addExam(list, exam(k, [st({student_id: '100', name: names[k]})])), []);
        const a = linkStudents(make(['2026-03', '2026-04', '2026-05']));
        const b = linkStudents(make(['2026-05', '2026-04', '2026-03']));
        const linked = (r) => r.persons.map(p => Object.keys(p.entries).sort().join('+')).sort();
        expect(linked(a)).toEqual(['2026-03+2026-04+2026-05']);
        expect(linked(b)).toEqual(linked(a));
    });

    it('학생 한 명의 사유는 한 줄로 모은다', () => {
        // 학번·반번호 두 키가 모두 겹쳐도 학생마다 한 줄이다
        const twin = () => st({student_id: 'A', class: '1', number: '1', name: '가'});
        const exams = build('3', '4').map(e => (e.key === '3' ? {...e, students: [twin(), twin()]} : {...e, students: [twin()]}));
        const {conflicts} = linkStudents(exams);
        expect(conflicts.map(c => [c.examKey, c.index])).toEqual([['3', 0], ['3', 1]]);
    });

    it('식별 키를 만들 수 없는 학생은 혼자 남는다', () => {
        expect(identityKeys(st({name: '가'}))).toEqual([]);
        const exams = build('3', '4').map(e => ({...e, students: [st({name: '가'})]}));
        expect(linkStudents(exams).persons).toHaveLength(2);
    });

    it('학년 간 대응표는 아직 받지 않는다', () => {
        expect(() => linkStudents([], {gradeTransitions: [{}]})).toThrow('아직 지원하지 않습니다');
    });
});
