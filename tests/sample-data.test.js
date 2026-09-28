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

// 탐구 두 과목을 따로 뽑아, 샘플 학생 열셋에 하나 꼴로 같은 과목이 두 번 들어갔다.
// 난수를 0.5 로 고정하면 예전 방식은 모든 학생이 같은 칸에서 두 과목을 뽑는다.
it('샘플 학생의 탐구1·탐구2 는 서로 다른 과목이다', () => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
        .replace(/^[\s\S]*<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
    vi.spyOn(console, 'error').mockImplementation(() => {
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
        loadSampleData();
    } catch {
        // 차트 그리기 실패는 이 시험의 관심사가 아니다
    }
    vi.restoreAllMocks();

    expect(ST.data).toHaveLength(100);
    for (const s of ST.data) expect(s.inquiry2.subject).not.toBe(s.inquiry1.subject);
});
