import {sortedExams} from './examStore.js';

/* ───────────────────────────────────────────
   § 회차 사이 동일인 연결
   같은 학년 안에서만 잇는다. 키: 학번 → 학년+반+번호. 이름은 키에 넣지 않는다(표기만 달라도
   한 학생이 둘로 나뉜다). 대신 키가 같은데 이름이 다르면 잇지 않고 확인 대상으로 남긴다.
   모호하면 잇지 않는다. 남에게 잘못 붙이는 것보다 못 잇고 알리는 편이 낫다.
   - 한 회차 안에서 키가 겹치는 학생(전학생 등)은 그 키로 잇지 않는다.
   - 한 사람에 같은 회차의 두 학생이 들어가게 되면 잇지 않는다.
   - 학년이 바뀐 회차 사이 연결(나이스 반·번호 이력 대응표)은 입력 자리(gradeTransitions)만 두고
     아직 만들지 않았다.
─────────────────────────────────────────── */

const clean = (v) => String(v ?? '').normalize('NFC').replace(/\s+/g, '');

/** 이름 비교용: 공백을 모두 지운다 */
export const nameKey = (s) => clean(s?.name);

/** 학생 한 명의 식별 키들. 만들 수 없는 키는 빠진다 */
export function identityKeys(s) {
    const grade = clean(s?.grade_year);
    const keys = [];
    const id = clean(s?.student_id);
    if (id) keys.push(`id:${grade}|${id}`);
    const cls = clean(s?.class);
    const num = clean(s?.number);
    if (cls && num) keys.push(`cn:${grade}|${cls}|${num}`);
    return keys;
}

/**
 * @param {{key: string, order: number, students: object[]}[]} exams
 * @returns {{
 *   persons: {name: string, entries: Record<string, number>}[],  // entries: 회차 키 → 그 회차 students 의 위치
 *   conflicts: {examKey: string, index: number, reason: string}[]
 * }}
 */
export function linkStudents(exams, {gradeTransitions} = {}) {
    if (gradeTransitions?.length) throw new Error('학년이 바뀐 회차 사이의 연결은 아직 지원하지 않습니다.');

    const list = sortedExams(exams);
    const nodes = [];
    list.forEach(exam => exam.students.forEach((s, index) => {
        if (nameKey(s)) nodes.push({examKey: exam.key, index, name: nameKey(s), keys: identityKeys(s)});
    }));

    const conflicts = [];
    const flag = (node, reason) => conflicts.push({examKey: node.examKey, index: node.index, reason});

    // 한 회차 안에서 겹치는 키는 쓰지 않는다
    const dupInExam = new Set();
    const seen = new Map();
    for (const n of nodes) for (const k of n.keys) {
        const id = `${n.examKey}\u0000${k}`;
        if (seen.has(id)) {
            dupInExam.add(id);
        } else seen.set(id, n);
    }
    for (const n of nodes) {
        const dups = n.keys.filter(k => dupInExam.has(`${n.examKey}\u0000${k}`));
        if (dups.length) flag(n, '같은 회차에 식별 키가 같은 학생이 있습니다.');
        n.keys = n.keys.filter(k => !dupInExam.has(`${n.examKey}\u0000${k}`));
    }

    // union-find. 그룹마다 이름과 포함된 회차를 들고 다닌다
    const parent = nodes.map((_, i) => i);
    const exams_ = nodes.map(n => new Set([n.examKey]));
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));

    const byKey = new Map();
    nodes.forEach((n, i) => n.keys.forEach(k => {
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(i);
    }));
    for (const members of byKey.values()) {
        for (let m = 1; m < members.length; m++) {
            const a = find(members[0]);
            const b = find(members[m]);
            if (a === b) continue;
            const na = nodes[members[0]];
            const nb = nodes[members[m]];
            if (na.name !== nb.name) {
                flag(nb, '식별 키가 같은데 이름이 다릅니다.');
                continue;
            }
            if ([...exams_[b]].some(k => exams_[a].has(k))) {
                flag(nb, '같은 회차의 두 학생이 한 사람으로 이어질 뻔했습니다.');
                continue;
            }
            parent[b] = a;
            exams_[b].forEach(k => exams_[a].add(k));
        }
    }

    const groups = new Map();
    nodes.forEach((n, i) => {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, {name: n.name, entries: {}});
        groups.get(root).entries[n.examKey] = n.index;
    });
    return {persons: [...groups.values()], conflicts};
}
