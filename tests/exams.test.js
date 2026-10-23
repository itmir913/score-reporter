import {describe, expect, it} from 'vitest';
import {
    addExam, fileHashHex, keyRank, moveExam, removeExam, renameExam, sortedExams, suggestExamKey,
} from '../src/js/exams/examStore.js';
import {identityKeys, linkStudents} from '../src/js/exams/identity.js';
import {PROJECT_EXTENSION, parseProject, serializeProject} from '../src/js/exams/projectFile.js';

const exam = (key, students = []) => ({key, formatId: 'univcoop', fileName: `${key}.xlsx`, fileHash: 'h', students});
const keys = (list) => sortedExams(list).map(e => e.key);
const build = (...ks) => ks.reduce((list, k) => addExam(list, exam(k)), []);

describe('회차 목록', () => {
    it('연월은 시간순 자리를 제안받는다', () => {
        expect(keys(build('2026-05', '2026-03', '2026-04'))).toEqual(['2026-03', '2026-04', '2026-05']);
    });

    it('숫자만 쓴 키(3, 4)도 크기순이고, 그 밖의 키(사설)는 넣은 순서대로 끝에 붙는다', () => {
        expect(keys(build('4', '사설', '3', '10'))).toEqual(['3', '4', '10', '사설']);
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

    it('keyRank', () => {
        expect(keyRank('2026.3')).toEqual([0, 202603]);
        expect(keyRank('3')).toEqual([1, 3]);
        expect(keyRank('사설')).toEqual([2, null]);
    });

    it.each([
        ['2026-03 모의고사.xlsx', '2026-03'],
        ['2026.4 학력평가.xlsx', '2026-04'],
        ['2026년 6월 모평.xls', '2026-06'],
        ['3월 학평.xlsx', '3'],
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

    it('키가 같은데 이름이 다르면 잇지 않고 알린다', () => {
        const exams = build('3', '4').map(e => ({...e, students: [st({class: '1', number: '1', name: e.key === '3' ? '가' : '나'})]}));
        const {persons, conflicts} = linkStudents(exams);
        expect(persons).toHaveLength(2);
        expect(conflicts).toEqual([
            {examKey: '3', index: 0, reason: '식별 키가 같은데 이름이 다릅니다.'},
            {examKey: '4', index: 0, reason: '식별 키가 같은데 이름이 다릅니다.'},
        ]);
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

    it('결과는 회차를 넣은 순서와 무관하다: 이름이 다른 한 명 때문에 나머지 둘을 놓치지 않는다', () => {
        // 감사 반례: 학번 100 이 A '이', B '김', C '김'
        const names = {'2026-03': '이', '2026-04': '김', '2026-05': '김'};
        const make = (order) => order.reduce((list, k) => addExam(list, exam(k, [st({student_id: '100', name: names[k]})])), []);
        const a = linkStudents(make(['2026-03', '2026-04', '2026-05']));
        const b = linkStudents(make(['2026-05', '2026-04', '2026-03']));
        const linked = (r) => r.persons.map(p => Object.keys(p.entries).sort().join('+')).sort();
        expect(linked(a)).toEqual(['2026-03', '2026-04+2026-05']);
        expect(linked(b)).toEqual(linked(a));
        expect(a.conflicts.map(c => c.examKey).sort()).toEqual(b.conflicts.map(c => c.examKey).sort());
    });

    it('학생 한 명의 사유는 한 줄로 모은다', () => {
        const exams = build('3', '4').map(e => ({...e, students: [st({student_id: 'A', class: '1', number: '1', name: e.key === '3' ? '가' : '나'})]}));
        const {conflicts} = linkStudents(exams);
        expect(conflicts.map(c => c.examKey)).toEqual(['3', '4']);
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

describe('프로젝트 파일', () => {
    const students = [st({class: '1', number: '1', name: '가상', korean: {raw: 80}})];

    it('저장한 것을 다시 읽으면 회차·순서·학생·옵션이 같다', () => {
        let list = build('3', '사설', '4').map(e => ({...e, students}));
        list = moveExam(list, '사설', 1);
        const text = serializeProject({exams: list, options: {includeNoInquiry: true, basis: 'std'}});
        const {exams, options} = parseProject(text);
        expect(keys(exams)).toEqual(keys(list));
        expect(exams[0]).toEqual({key: '3', order: 0, formatId: 'univcoop', fileName: '3.xlsx', fileHash: 'h', students});
        expect(options).toEqual({includeNoInquiry: true, basis: 'std'});
    });

    it('원본 엑셀(바이트)은 담지 않는다', () => {
        const text = serializeProject({exams: [{...exam('3', students), order: 0, bytes: new Uint8Array([1])}]});
        expect(JSON.parse(text).exams[0]).not.toHaveProperty('bytes');
    });

    it.each([
        ['깨진 파일', '{', '읽을 수 없습니다'],
        ['다른 파일', '{"format":"x"}', '프로젝트 파일이 아닙니다'],
        ['다른 버전', '{"format":"score-reporter-project","version":99,"exams":[]}', '버전 99'],
        ['키 중복', '{"format":"score-reporter-project","version":1,"exams":[{"key":"3","students":[]},{"key":" 3","students":[]}]}', '두 번'],
        ['학생 없음', '{"format":"score-reporter-project","version":1,"exams":[{"key":"3"}]}', '학생 목록'],
    ])('%s 는 알아볼 수 있는 오류를 낸다', (_, text, msg) => {
        expect(() => parseProject(text)).toThrow(msg);
    });

    it('파일 꼬리는 .gitignore 에 걸려 있다', async () => {
        const {readFileSync} = await import('node:fs');
        expect(readFileSync('.gitignore', 'utf-8')).toContain(`*${PROJECT_EXTENSION}`);
    });
});
