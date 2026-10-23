import {normalizeExamKey, sortedExams} from './examStore.js';

/* ───────────────────────────────────────────
   § 프로젝트 파일(.json) 저장·불러오기
   모든 회차를 파일 하나에 담는다. 브라우저 저장소(IndexedDB 등)에는 남기지 않는다 —
   학교 공용 PC 에 성적이 남지 않게 하려는 것이다. 원본 엑셀은 담지 않는다.
─────────────────────────────────────────── */

export const PROJECT_FORMAT = 'score-reporter-project';
export const PROJECT_VERSION = 1;
/** .gitignore 에도 이 꼬리를 걸어 둔다 */
export const PROJECT_EXTENSION = '.score.json';

export const PRIVACY_WARNING =
    '이 파일에는 학생 이름과 성적이 그대로 들어 있습니다. 공용 PC·메신저·공개 폴더에 두지 말고, 다 쓰면 지우세요.';

/**
 * @param {{exams: object[], options?: object}} project
 * @returns {string}
 */
export function serializeProject({exams, options = {}}) {
    return JSON.stringify({
        format: PROJECT_FORMAT,
        version: PROJECT_VERSION,
        savedAt: new Date().toISOString(),
        options,
        exams: sortedExams(exams).map(({key, order, formatId, fileName, fileHash, students}) =>
            ({key, order, formatId, fileName, fileHash, students})),
    });
}

/**
 * 읽은 글을 검사해 프로젝트로 돌려준다. 이상하면 사람이 읽을 Error.
 * @param {string} text
 * @returns {{exams: object[], options: object}}
 */
export function parseProject(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('프로젝트 파일을 읽을 수 없습니다. 손상되었거나 다른 파일입니다.');
    }
    if (data?.format !== PROJECT_FORMAT) throw new Error('모의고사 분석 프로젝트 파일이 아닙니다.');
    if (data.version !== PROJECT_VERSION) {
        throw new Error(`이 프로젝트 파일은 버전 ${data.version} 형식이라 읽을 수 없습니다(지원: ${PROJECT_VERSION}).`);
    }
    if (!Array.isArray(data.exams)) throw new Error('프로젝트 파일에 회차 목록이 없습니다.');

    const keys = new Set();
    const exams = data.exams.map((e, i) => {
        const key = normalizeExamKey(e?.key);
        if (!key) throw new Error(`${i + 1}번째 회차에 이름이 없습니다.`);
        if (keys.has(key)) throw new Error(`「${key}」 회차가 두 번 들어 있습니다.`);
        keys.add(key);
        if (!Array.isArray(e.students)) throw new Error(`「${key}」 회차에 학생 목록이 없습니다.`);
        return {
            key,
            order: Number.isInteger(e.order) ? e.order : i,
            formatId: e.formatId ?? null,
            fileName: e.fileName ?? '',
            fileHash: e.fileHash ?? '',
            students: e.students,
        };
    });
    // 저장된 순서를 따르되 0..n-1 로 다시 매긴다
    const ordered = sortedExams(exams).map((e, i) => ({...e, order: i}));
    return {exams: ordered, options: data.options ?? {}};
}
