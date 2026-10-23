import {exceljsTo2DArray} from '../main.js';

/* ───────────────────────────────────────────
   § 양식 자동 매칭 (헤더 지문)
   양식의 정본은 schema.js 하나다. 지문의 원천은 그 양식의 exportHeaders(실제 헤더 블록 그대로)이고,
   저장하지 않고 쓸 때마다 계산한다. 그래서 헤더를 고치면 지문도 저절로 따라온다.
   - 헤더 줄 수와 모든 열의 위치·이름이 (정리 후) 같아야 맞는다.
   - 정확히 한 양식만 맞을 때만 자동으로 선택한다. 둘 이상이거나 없으면 사람이 선택한다.
   - 자동으로 골랐어도 사람이 미리보기를 보고 바꿀 수 있다.
   정리 규칙은 admission-outcomes 의 headerHash.js 와 같다.
─────────────────────────────────────────── */

/** 헤더 칸 하나를 지문용으로 정리한다: 전각→반각, 폭 없는 문자 제거, 공백 하나로 */
export function normalizeHeaderCell(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/　/g, ' ')
        .replace(/[​-‍﻿]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// 칸·줄 사이에 원본 헤더에 나올 수 없는 제어 문자를 끼운다. 구분자가 없으면
// ['국어', '수학'] 과 ['국어수학', ''] 이 같은 지문이 된다
const CELL_SEP = '\u001F';
const ROW_SEP = '\u001E';

/** 헤더 블록(앞 headerRows 줄)의 지문 문자열. 줄마다 오른쪽 끝 빈 칸은 무시한다 */
export function headerSignature(rows, headerRows) {
    const block = (rows ?? []).slice(0, headerRows);
    while (block.length < headerRows) block.push([]);
    return block.map(row => {
        const line = Array.from(row ?? [], normalizeHeaderCell);
        while (line.length && line[line.length - 1] === '') line.pop();
        return line.join(CELL_SEP);
    }).join(ROW_SEP);
}

/** 양식 정의의 지문. exportHeaders 가 곧 그 양식의 헤더 블록이다 */
export function schemaSignature(schema) {
    return headerSignature(schema.exportHeaders, schema.headerRows);
}

/**
 * 시트의 앞 headerRows 줄을 지문용으로 읽는다.
 * 병합 범위에서 주인 칸(왼쪽 위)이 아닌 칸은 읽기 경로와 상관없이 '' 로 만든다.
 * ExcelJS 는 병합된 칸에도 주인 값을 돌려주고(가로·세로 모두), exportHeaders 는 그 칸을 '' 로 적기 때문이다.
 * SheetJS 로 읽은 시트는 loadWorkbook 이 남긴 ws.sheetjsMerges 로 같은 처리를 한다.
 * 본문 읽기(exceljsTo2DArray 그대로)에는 영향을 주지 않는다.
 */
export function headerRowsForMatch(ws, headerRows) {
    const rows = exceljsTo2DArray(ws).slice(0, headerRows).map(r => [...r]);
    rows.forEach((row, r) => row.forEach((_, c) => {
        const cell = ws.getCell(r + 1, c + 1);
        if (cell.isMerged && cell.master !== cell) row[c] = '';
    }));
    for (const {s, e} of ws.sheetjsMerges ?? []) {
        for (let r = s.r; r <= Math.min(e.r, headerRows - 1); r++) {
            for (let c = s.c; c <= e.c; c++) {
                if ((r !== s.r || c !== s.c) && rows[r]) rows[r][c] = '';
            }
        }
    }
    return rows;
}

/**
 * 이 시트와 헤더가 맞는 양식들.
 * @returns {{candidates: string[], autoId: string|null}} autoId 는 정확히 하나만 맞을 때만 채운다
 */
export function matchFormats(ws, schemas) {
    const candidates = Object.values(schemas)
        .filter(schema => headerSignature(headerRowsForMatch(ws, schema.headerRows), schema.headerRows) === schemaSignature(schema))
        .map(schema => schema.id);
    return {candidates, autoId: candidates.length === 1 ? candidates[0] : null};
}

/* 값 범위 교차검증. 자동으로 선택한 양식이라도 열이 엉뚱하면 값이 범위를 벗어난다 */
const RANGES = {
    pct: [0, 100],
    grade: [1, 9],
};
const RAW_MAX = {korean: 100, math: 100, english: 100, inquiry1: 50, inquiry2: 50, hist: 50, fl2: 50};

/** 범위를 벗어난 값의 개수 */
export function countOutOfRange(records) {
    let count = 0;
    for (const s of records) {
        for (const [subj, rawMax] of Object.entries(RAW_MAX)) {
            const d = s[subj];
            if (!d) continue;
            if (Number.isFinite(d.raw) && (d.raw < 0 || d.raw > rawMax)) count++;
            for (const [k, [min, max]] of Object.entries(RANGES)) {
                if (Number.isFinite(d[k]) && (d[k] < min || d[k] > max)) count++;
            }
        }
    }
    return count;
}
