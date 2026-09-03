import {defineConfig} from 'vite';

/* 오프라인 zip은 압축을 풀고 index.html을 그냥 더블클릭해서 여는 용도다.
 * 그때 주소는 file:// 이 되는데, 브라우저는 file:// 을 출처 null로 보기 때문에
 *   - <script type="module">  → 모듈 파일을 CORS로 가로막는다
 *   - crossorigin 속성이 붙은 <link>/<script> → 마찬가지로 막힌다
 * 둘 다 걸리면 화면이 하얗게 뜬다. 분리 전에는 평범한 <script> 태그였기 때문에
 * 이 문제가 없었고, 빌드를 넣으면서 깨뜨리지 않으려면 아래 둘이 필요하다.
 *   1. 번들을 iife로 내보내 모듈 문법 없이 실행되게 한다
 *   2. 생성된 태그에서 type="module"과 crossorigin을 걷어낸다
 * defer를 붙이는 이유는 이 스크립트가 <head>에 있어서다. 없으면 DOM이 만들어지기
 * 전에 실행된다. type="module"이 원래 defer처럼 동작했으므로 그 자리를 메운다. */
function fileProtocolSafeHtml() {
    return {
        name: 'file-protocol-safe-html',
        enforce: 'post',
        transformIndexHtml(html) {
            return html
                .replace(/<script\s+([^>]*)><\/script>/g, (tag, attrs) => {
                    if (!/type="module"/.test(attrs)) return tag;
                    const src = attrs.match(/src="([^"]+)"/);
                    return src ? `<script defer src="${src[1]}"></script>` : tag;
                })
                .replace(/(<link\b[^>]*?)\s+crossorigin(?=[\s>])/g, '$1');
        },
    };
}

export default defineConfig({
    // 상대 경로로 내보낸다. GitHub Pages의 하위 경로에서도, 오프라인 zip을 풀어
    // file:// 로 열어도 똑같이 동작하게 하려는 것이다. 절대 경로면 둘 중 하나가 깨진다.
    base: './',

    plugins: [fileProtocolSafeHtml()],

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // exceljs와 xlsx가 각각 1MB 안팎이라 기본 경고선(500KB)을 넘는다.
        // 브라우저에서 통째로 쓰는 라이브러리라 쪼갤 실익이 없어 경고선만 올린다.
        chunkSizeWarningLimit: 3000,
        // modulepreload 링크는 모듈 전용이라 iife에서는 쓸모가 없다.
        modulePreload: false,
        // iife로 내보내면 Vite가 CSS를 JS 안에 넣고 실행 시점에 <style>로 주입한다.
        // 그러면 1.7MB짜리 JS를 다 읽을 때까지 스타일 없는 화면이 보인다.
        // 한 덩어리로 뽑아 <link>로 먼저 걸리게 한다.
        cssCodeSplit: false,
        rollupOptions: {
            output: {format: 'iife', inlineDynamicImports: true},
        },
    },

    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
    },
});
