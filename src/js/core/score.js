// 점수 칸 값 → 숫자. 없거나 숫자가 아니면 null.
// parseFloat 는 앞부분만 읽어 "1,234" 가 1, "85abc" 가 85, "1e2" 가 100 이 되었다.
// 문자열은 소수 하나(뒤에 '점'·'%' 하나까지)만 받고 나머지는 모두 버린다
const SCORE_TEXT = /^-?\d+(?:\.\d+)?\s*[점%]?$/;

export function toScore(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return SCORE_TEXT.test(t) ? parseFloat(t) : null;
}
