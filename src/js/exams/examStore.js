import {sha256} from '../sha.js';

/* ───────────────────────────────────────────
   § 회차 목록
   회차 하나 = 엑셀 하나를 한 양식으로 읽은 결과.
     {key, order, formatId, fileName, fileHash, students}
   - key: 사람이 정하는 회차 이름. `2026-03`, `3`, `사설` 무엇이든 된다. 같은 키는 두 번 쓸 수 없다.
   - order: 시간 순서. 키와 따로 둔다. 키로 처음 자리를 제안하고, 사람이 옮길 수 있다.
     통계 화면의 가로축은 언제나 이 순서를 따른다.
   함수들은 목록을 고치지 않고 새 목록을 돌려준다. order 는 늘 0..n-1 로 다시 매긴다.
─────────────────────────────────────────── */

/** 비교용 키. 앞뒤 공백을 지우고 한글 정규화(NFC)를 맞춘다 */
export function normalizeExamKey(key) {
    return String(key ?? '').normalize('NFC').trim();
}

/** 이미 있는 키인가 (정규화해서 비교) */
export function hasExamKey(exams, key) {
    const k = normalizeExamKey(key);
    return exams.some(e => normalizeExamKey(e.key) === k);
}

/* 처음 자리를 정하는 순위: YYYY-MM → 숫자(월) → 그 밖의 문자열(넣은 순서대로 끝에).
 * 연월끼리, 숫자끼리만 크기를 비교한다. 서로 다른 종류의 앞뒤는 사람이 정한다(옮기기) */
const YEAR_MONTH = /^(\d{4})[-./](\d{1,2})$/;
const NUMBER = /^(\d+)\s*월?$/;

export function keyRank(key) {
    const k = normalizeExamKey(key);
    const ym = k.match(YEAR_MONTH);
    if (ym) return [0, Number(ym[1]) * 100 + Number(ym[2])];
    const num = k.match(NUMBER);
    if (num) return [1, Number(num[1])];
    return [2, null];
}

const reindex = (list) => list.map((e, i) => ({...e, order: i}));

/** 현재 순서 그대로 */
export function sortedExams(exams) {
    return [...exams].sort((a, b) => a.order - b.order);
}

/**
 * 회차를 더한다. 키가 비었거나 이미 있으면 Error.
 * 자리: 같은 종류(연월끼리, 숫자끼리)에서 키가 더 큰 첫 회차 앞. 없으면 그 종류의 마지막 뒤,
 * 그 종류가 없으면 맨 끝. 사람이 이미 바꿔 둔 다른 회차들의 순서는 건드리지 않는다.
 */
export function addExam(exams, exam) {
    const key = normalizeExamKey(exam.key);
    if (!key) throw new Error('회차 이름을 입력해 주세요.');
    if (hasExamKey(exams, key)) throw new Error(`「${key}」 회차가 이미 있습니다. 다른 이름을 쓰세요(예: ${key}1, ${key}2).`);

    const list = sortedExams(exams);
    const [kind, value] = keyRank(key);
    let at = list.length;
    if (kind !== 2) {
        const sameKind = list.map((e, i) => ({i, r: keyRank(e.key)})).filter(({r}) => r[0] === kind);
        const after = sameKind.find(({r}) => r[1] > value);
        if (after) at = after.i;
        else if (sameKind.length) at = sameKind[sameKind.length - 1].i + 1;
    }
    list.splice(at, 0, {...exam, key});
    return reindex(list);
}

/** 키로 찾아 지운다 */
export function removeExam(exams, key) {
    const k = normalizeExamKey(key);
    return reindex(sortedExams(exams).filter(e => normalizeExamKey(e.key) !== k));
}

/** 한 칸 앞(-1)이나 뒤(+1)로 옮긴다. 끝에서는 그대로 */
export function moveExam(exams, key, delta) {
    const list = sortedExams(exams);
    const i = list.findIndex(e => normalizeExamKey(e.key) === normalizeExamKey(key));
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return reindex(list);
    [list[i], list[j]] = [list[j], list[i]];
    return reindex(list);
}

/** 이름을 바꾼다. 순서는 그대로다. 비었거나 다른 회차와 겹치면 Error */
export function renameExam(exams, key, newKey) {
    const from = normalizeExamKey(key);
    const to = normalizeExamKey(newKey);
    if (!to) throw new Error('회차 이름을 입력해 주세요.');
    if (to !== from && hasExamKey(exams, to)) throw new Error(`「${to}」 회차가 이미 있습니다.`);
    return reindex(sortedExams(exams).map(e => (normalizeExamKey(e.key) === from ? {...e, key: to} : e)));
}

/**
 * 파일 이름에서 회차 이름을 제안한다. 확신이 없으면 '' — 사람이 채운다.
 * `2026-03`, `2026.3`, `2026년 3월` → '2026-03', `3월` → '3월', `사설` 이 들어 있으면 '사설'.
 */
export function suggestExamKey(fileName) {
    const name = String(fileName ?? '').normalize('NFC').replace(/\.[^.]+$/, '');
    const pad = (m) => String(m).padStart(2, '0');
    const ym = name.match(/(20\d{2})\s*(?:[-./]|년\s*)\s*(\d{1,2})(?:\s*월)?(?!\d)/);
    if (ym && Number(ym[2]) >= 1 && Number(ym[2]) <= 12) return `${ym[1]}-${pad(ym[2])}`;
    const m = name.match(/(?<!\d)(\d{1,2})\s*월/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${Number(m[1])}월`;
    if (name.includes('사설')) return '사설';
    return '';
}

/** 같은 파일을 다시 올렸는지 가리는 내용 해시(SHA-256, 16진) */
export function fileHashHex(bytes) {
    return Array.from(sha256(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
