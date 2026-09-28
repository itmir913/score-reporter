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
 * 값을 80.3 으로 내린다. 15자리로 다듬어 그 오차를 걷어낸 뒤 반올림한다. */
export function roundHalfUp(v, d = 0) {
    const scaled = Number((Math.abs(v) * 10 ** d).toPrecision(15));
    return Math.sign(v) * Math.round(scaled) / 10 ** d;
}

export function toFixedHalfUp(v, d = 0) {
    if (!Number.isFinite(v)) return '-';
    return roundHalfUp(v, d).toFixed(d);
}

export function fmt(v, d = 1) {
    return v !== null && !isNaN(v) ? parseFloat(v).toFixed(d) : '-';
}

export function dlBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href: url, download: name});
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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