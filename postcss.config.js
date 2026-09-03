import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

/* Font Awesome의 @font-face는 woff2를 먼저 쓰고 ttf를 폴백으로 둔다.
 *
 * ttf 네 개가 641KB로 빌드의 14%를 차지하는데, woff2를 못 읽는 브라우저는 이 앱의
 * 대상이 아니다. woff2는 2015년 이후 주요 브라우저가 모두 지원하고, 이 앱은 이미
 * ES2019 문법과 Chart.js 4를 쓴다.
 *
 * 폴백 선언을 지우면 CSS가 ttf를 참조하지 않게 되고, 그러면 Vite가 그 파일들을
 * 아예 내보내지 않는다. 산출물에서 지우는 게 아니라 참조를 끊어 안 만들게 하는 것이다.
 *
 * Pretendard는 woff2 하나뿐이라 이 플러그인이 건드리지 않는다.
 */
const dropTrueTypeFallback = () => ({
    postcssPlugin: 'drop-truetype-fallback',
    Declaration: {
        src(decl) {
            if (!decl.value.includes('truetype')) return;
            const kept = splitTopLevel(decl.value).filter((s) => !s.includes('truetype'));
            // 남는 게 없으면 그 폰트는 ttf만 있는 것이므로 손대지 않는다.
            if (kept.length) decl.value = kept.join(',');
        },
    },
});
dropTrueTypeFallback.postcss = true;

/** url(...) 안의 쉼표를 자르지 않도록 괄호 깊이를 세면서 나눈다. */
function splitTopLevel(value) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) {
            parts.push(value.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(value.slice(start).trim());
    return parts;
}

export default {
    plugins: [dropTrueTypeFallback(), tailwindcss(), autoprefixer()],
};
