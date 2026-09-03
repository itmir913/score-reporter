/** @type {import('tailwindcss').Config} */
export default {
    // JS가 문자열로 만들어 innerHTML에 넣는 마크업에도 Tailwind 클래스가 들어 있다.
    // js를 훑지 않으면 그 클래스들이 통째로 빠진다.
    content: ['./index.html', './src/**/*.{js,html}'],
    theme: {extend: {}},
    plugins: [],
};
