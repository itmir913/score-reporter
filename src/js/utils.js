/* ───────────────────────────────────────────
       § 유틸리티
    ─────────────────────────────────────────── */
export function colToIdx(col) {
    if (!col || !col.trim()) return null;
    let r = 0;
    for (let i = 0; i < col.length; i++) r = r * 26 + (col.charCodeAt(i) - 64);
    return r - 1;
}

export function avgOf(arr) {
    const v = arr.filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/* 소수 d자리 사사오입(0에서 먼 쪽). toFixed 는 80.35 처럼 2진수로 딱 떨어지지 않는
 * 값을 80.3 으로 내린다. 15자리로 반올림해 그 오차를 걷어낸 뒤 반올림한다. */
export function roundHalfUp(v, d = 0) {
    const scaled = Number((Math.abs(v) * 10 ** d).toPrecision(15));
    return Math.sign(v) * Math.round(scaled) / 10 ** d;
}

export function toFixedHalfUp(v, d = 0) {
    if (!Number.isFinite(v)) return DASH;
    return roundHalfUp(v, d).toFixed(d);
}

/** 점수 자리에 값이 없을 때 쓰는 표시. 하이픈(-)은 음수·뺄셈과 헷갈려 긴 대시를 쓴다 */
export const DASH = '—';

/**
 * 학년·반·번호를 견줄 때 쓰는 값. 숫자 하나(뒤에 「학년」「반」「번」이 붙어도 된다)면 그 숫자, 앞의 0도 뗀다.
 * 양식에 따라 「01」·1·「1반」으로 다르게 적어도 같은 반·번호로 본다. 그 밖의 글(「가반」 등)은 그대로
 */
export function unitNumberKey(v) {
    const t = String(v ?? '').normalize('NFC').replace(/\s+/g, '');
    const m = /^(\d+)(?:학년|반|번)?$/.exec(t);
    return m ? String(Number(m[1])) : t;
}

/** 반·번호·학년 뒤에 단위를 붙인다. 이미 「1반」「5번」「3학년」처럼 붙어 있으면 그대로 둔다(「1반반」이 되지 않게) */
export function withUnit(v, unit) {
    const t = String(v ?? '').trim();
    if (!t) return '';
    return t.endsWith(unit) ? t : `${t}${unit}`;
}

/* 표시용 숫자. 숫자 문자열도 받는다. 사사오입은 toFixedHalfUp 과 같다 */
export function fmt(v, d = 1) {
    return toFixedHalfUp(v === null || v === undefined || v === '' ? NaN : Number(v), d);
}

export function dlBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href: url, download: name});
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* 응시 여부는 과목명이 아니라 점수로 판단한다. 원점수·표준점수·백분위·등급(공통·선택 원점수 포함) 중
 * 하나라도 있으면 응시한 과목이다. 넷 다 비어 있으면 과목명이 무엇이든 응시하지 않은 과목이다 */
export function hasScore(d) {
    return ['raw', 'std', 'pct', 'grade', 'common_raw', 'select_raw'].some(k => Number.isFinite(d?.[k]));
}

/* 응시하지 않았다는 뜻으로 과목명 칸에 적는 말. 유니브처럼 「미응시」를 적는 양식이 있고, 빈칸으로 두는
 * 양식도 있다. 읽을 때 빈 과목명으로 바꿔 선택과목 집계에 과목처럼 끼지 않게 한다 */
const NOT_TAKEN = new Set(['미응시', '결시', '미선택', '선택안함', '-', '—', '없음']);

export function subjectName(v) {
    const t = String(v ?? '').trim();
    return NOT_TAKEN.has(t.replace(/\s+/g, '')) ? '' : t;
}

// 탐구1·탐구2 과목명이 같은가 (원본 입력 실수). 선택 비율·과목 분포에서 한 번만 센다.
// 둘 다 점수가 있을 때만 중복이다. 과목명만 같고 점수가 없으면 응시하지 않은 것이다
export function sameInquirySubject(s) {
    const a = s?.inquiry1?.subject;
    return typeof a === 'string' && a.trim() !== '' && a === s?.inquiry2?.subject
        && hasScore(s.inquiry1) && hasScore(s.inquiry2);
}

const SCORE_KEYS = ['raw', 'std', 'pct', 'grade', 'common_raw', 'select_raw'];

/* 탐구 과목 목록. 탐구1·2 과목이 같으면(sameInquirySubject) 한 과목으로 합친다:
 * 점수 항목마다 탐구1 값이 있으면 탐구1, 없으면 탐구2 값을 쓴다. 평균·선택과목 통계·분포·n합이 모두 이것을 쓴다 */
export function inquiryScores(s) {
    if (sameInquirySubject(s)) {
        const merged = {...s.inquiry1};
        for (const k of SCORE_KEYS) {
            if (!Number.isFinite(merged[k]) && Number.isFinite(s.inquiry2[k])) merged[k] = s.inquiry2[k];
        }
        return [merged];
    }
    return [s?.inquiry1, s?.inquiry2].filter(Boolean);
}

// HTML 속성용 안전한 이스케이프 함수
export function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}