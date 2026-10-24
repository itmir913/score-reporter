/**
 * 열 목록(레지스트리)과 값 글자.
 *
 * admission-outcomes 의 src/analysis/registry.js 에서 표·필터가 쓰는 부분만 옮겼다.
 * 다른 점:
 * - 열 이름·묶음·숫자 여부는 **열 정의(fields)가 정한다.** 원본은 fields.json 과 자료에서
 *   추론하지만, 학번처럼 값이 전부 숫자인 열을 숫자 열로 보면 값 목록 대신 범위칸이 뜬다.
 *   자료에서는 채워진 수·가짓수·범위만 센다.
 * - 숫자는 표에 적는 글자 그대로(정수는 그대로, 소수는 1자리). 표·검색·값 목록이 같은 글자를 쓴다.
 */

/** 열 묶음. 열 선택 대화상자가 이 차례로 묶는다 */
export const GROUP_ORDER = ['student', 'score'];
export const GROUP_LABEL = {student: '학생 정보', score: '점수'};

export function isBlank(value) {
    return value === null || value === undefined || value === '';
}

/** 숫자 하나를 화면 글자로. 표와 검색과 값 목록이 **같은 글자**를 써야 한다 */
export function formatNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * 값 목록 한 줄의 이름. 원본은 한 값에 화면 글자가 여럿 묶일 때 그것까지 적는다.
 * 성적 자료에는 그런 값이 없지만, 값 목록(filters.js)이 같은 모양을 받으므로 그대로 둔다.
 * @returns {{label: string, terms: string[]}}
 */
export function bucketLabel(key, value, 품은글자 = []) {
    const 바탕 = valueLabel(key, value);
    const 섞인것 = [...new Set(품은글자.filter((text) => text && text !== 바탕))];
    if (섞인것.length === 0) return {label: 바탕, terms: [바탕]};
    const 전부 = 품은글자.length > 0 && 품은글자.every((text) => text && text !== 바탕);
    const 보일것 = 섞인것.slice(0, 2).join('·');
    const 나머지 = 섞인것.length > 2 ? ` 외 ${섞인것.length - 2}` : '';
    return {label: `${바탕}(${보일것}${나머지}${전부 ? '' : ' 포함'})`, terms: [바탕, ...섞인것]};
}

/** 값을 화면 말로. 빈칸은 값 목록에서 「(빈칸)」 한 줄이다(빈칸은 0점이 아니다) */
export function valueLabel(key, value) {
    if (isBlank(value)) return '(빈칸)';
    if (typeof value === 'number') return formatNumber(value);
    return String(value);
}

/**
 * @typedef {object} Field
 * @property {string} key
 * @property {string} label
 * @property {string} group
 * @property {'number'|'text'} type
 * @property {number} filled 값이 있는 행 수
 * @property {number} cardinality 서로 다른 값의 가짓수
 * @property {{min: number, max: number}|null} range 숫자 열의 범위
 * @property {boolean} numeric 숫자로 다루는 열인지(범위칸·정렬)
 * @property {boolean} integer 값이 모두 정수인지(범위칸의 눈금)
 */

/**
 * 열 정의와 행으로 열 목록을 만든다. 열은 fields 에 있는 것만이다 — 행의 다른 키
 * (`#index` 같은 화면 내부용)는 열·검색·값 목록에 나오지 않는다.
 *
 * @param {object[]} rows
 * @param {{key: string, label: string, group?: string, numeric?: boolean}[]} fields
 * @returns {Field[]}
 */
export function buildRegistry(rows, fields) {
    return fields.map((field) => {
        const counts = new Set();
        let filled = 0;
        let min = Infinity;
        let max = -Infinity;
        let integer = true;
        for (const row of rows) {
            const value = row[field.key];
            if (isBlank(value)) continue;
            filled += 1;
            counts.add(valueLabel(field.key, value));
            if (typeof value === 'number' && Number.isFinite(value)) {
                if (value < min) min = value;
                if (value > max) max = value;
                if (!Number.isInteger(value)) integer = false;
            }
        }
        const numeric = Boolean(field.numeric);
        return {
            key: field.key,
            label: field.label,
            group: field.group ?? 'student',
            type: numeric ? 'number' : 'text',
            filled,
            cardinality: counts.size,
            range: numeric && min <= max ? {min, max} : null,
            numeric,
            integer,
        };
    });
}
