/* ───────────────────────────────────────────
   § 인쇄용 팝업 공용
   보고서 인쇄·성적통지표·학생 명단 인쇄가 같은 길로 팝업을 열고, 같은 글꼴을 싣는다.
─────────────────────────────────────────── */

export const POPUP_BLOCKED = '팝업이 차단되었습니다. 브라우저의 팝업 허용 설정을 확인해주세요.';

/** 빈 팝업을 연다. 막히면 알리고 null. 팝업 차단을 피하려고 클릭 처리 안에서 바로 부른다 */
export function openPopup(features) {
    const pw = window.open('', '_blank', features);
    if (!pw) alert(POPUP_BLOCKED);
    return pw;
}

/** 문서에 실린 웹 글꼴(Pretendard)을 팝업에도 싣는다. 주소는 원래 스타일시트 기준으로 절대 주소로 바꾼다 */
export function fontFaces() {
    const out = [];
    for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        const base = sheet.href || location.href;
        for (const rule of rules) {
            if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
            out.push(rule.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
                try { return `url("${new URL(u, base).href}")`; } catch { return m; }
            }));
        }
    }
    return out.join('\n');
}
