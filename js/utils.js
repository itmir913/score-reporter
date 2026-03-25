/* ───────────────────────────────────────────
       § 유틸리티
    ─────────────────────────────────────────── */
function colToIdx(col) {
    if (!col || !col.trim()) return null;
    let r = 0;
    for (let i = 0; i < col.length; i++) r = r * 26 + (col.charCodeAt(i) - 64);
    return r - 1;
}

function avgOf(arr) {
    const v = arr.filter(x => x !== null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function fmt(v, d = 1) {
    return v !== null && !isNaN(v) ? parseFloat(v).toFixed(d) : '-';
}

function dlBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href: url, download: name});
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// HTML 속성용 안전한 이스케이프 함수
function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}