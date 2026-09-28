import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect, it, vi} from 'vitest';
import {convertRomanToNumber} from '../src/js/schema.js';
import {loadSampleData, ST} from '../src/js/main.js';

// 실제 화면 마크업 위에서 샘플을 불러온다. 차트는 jsdom 에서 그려지지 않으므로
// 리포트 그리기가 도중에 멈춰도 ST.data 는 그 전에 채워진다.
it('샘플 과학탐구 과목명은 실제 시험 파일처럼 로마 숫자 Ⅰ을 쓴다', () => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    vi.spyOn(console, 'error').mockImplementation(() => {
    });
    try {
        loadSampleData();
    } catch {
        // 차트 그리기 실패는 이 시험의 관심사가 아니다
    }
    vi.restoreAllMocks();

    const subjects = ST.data.flatMap(s => [s.inquiry1.subject, s.inquiry2.subject]);
    expect(subjects.length).toBeGreaterThan(0);
    // 라틴 문자 I 로 끝나면 내보내기 변환(Ⅰ→1)이 먹지 않는다
    for (const sub of subjects) expect(sub).not.toMatch(/[A-Za-z]$/);
    const science = subjects.filter(sub => /(물리학|화학|생명과학|지구과학)/.test(sub));
    for (const sub of science) expect(convertRomanToNumber(null, sub)).toMatch(/1$/);
});
