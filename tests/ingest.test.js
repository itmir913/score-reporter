import crypto from 'node:crypto';
import {beforeAll, describe, expect, it} from 'vitest';
import ExcelJS from 'exceljs';
import {zipSync} from 'fflate';
import * as XLSX from 'xlsx';
import {expandUploads, loadWorkbook} from '../src/js/ingest/files.js';
import {countOutOfRange, headerSignature, matchFormats, schemaSignature} from '../src/js/ingest/formatMatch.js';
import {FormatSchema, SCHEMAS} from '../src/js/schema.js';
import {WrongPasswordError} from '../src/js/xlsx-decrypt.js';
import {encryptAgile, toContainer} from './helpers/office-encrypt.js';

const FORMATS = Object.keys(SCHEMAS);

/* exportHeaders 의 빈 칸 중 병합으로 보이는 자리를 병합 범위로 만든다.
 *  - 윗줄 이름 오른쪽의 빈 칸(아래 줄에 이름이 있는 열) → 가로 병합
 *  - 이름 아래가 끝까지 빈 칸 → 세로 병합
 * 실제 업체 파일이 이렇게 병합되어 있고, 읽는 쪽은 병합 칸을 경로마다 다르게 돌려준다. */
function mergesFor(headers) {
    const rows = headers.length;
    const width = Math.max(...headers.map(r => r.length));
    const merges = [];
    const covered = new Set();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < width; c++) {
            if (!headers[r][c] || covered.has(`${r},${c}`)) continue;
            const belowEmpty = r < rows - 1 && headers.slice(r + 1).every(row => !row[c]);
            if (belowEmpty) {
                merges.push({s: {r, c}, e: {r: rows - 1, c}});
                for (let rr = r + 1; rr < rows; rr++) covered.add(`${rr},${c}`);
                continue;
            }
            let end = c;
            while (end + 1 < width && !headers[r][end + 1] && r < rows - 1 && headers[r + 1][end + 1]) end++;
            if (end > c) {
                merges.push({s: {r, c}, e: {r, c: end}});
                for (let cc = c + 1; cc <= end; cc++) covered.add(`${r},${cc}`);
            }
        }
    }
    return merges;
}

const body = (width) => [Array.from({length: width}, (_, i) => (i === 0 ? 3 : i))];

async function xlsxBytes(headers, {merge = true} = {}) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('성적');
    ws.addRows([...headers, ...body(headers[0].length)]);
    if (merge) for (const {s, e} of mergesFor(headers)) ws.mergeCells(s.r + 1, s.c + 1, e.r + 1, e.c + 1);
    return new Uint8Array(await wb.xlsx.writeBuffer());
}

/* SheetJS 경로(.xls). 엑셀이 아닌 도구처럼 병합된 칸에도 주인 값을 적어 둔다 */
function xlsBytes(headers) {
    const merges = mergesFor(headers);
    const filled = headers.map(r => [...r]);
    for (const {s, e} of merges) {
        for (let r = s.r; r <= e.r; r++) for (let c = s.c; c <= e.c; c++) filled[r][c] = headers[s.r][s.c];
    }
    const sheet = XLSX.utils.aoa_to_sheet([...filled, ...body(headers[0].length)]);
    sheet['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, '성적');
    return new Uint8Array(XLSX.write(wb, {type: 'array', bookType: 'xls'}));
}

const firstSheet = (wb) => wb.worksheets[0];

describe('양식 지문', () => {
    it('5종 양식의 지문은 서로 다르다', () => {
        const sigs = FORMATS.map(id => schemaSignature(SCHEMAS[id]));
        expect(new Set(sigs).size).toBe(FORMATS.length);
    });

    it('칸 경계가 뭉개지지 않는다', () => {
        expect(headerSignature([['국어', '수학']], 1)).not.toBe(headerSignature([['국어수학', '']], 1));
        expect(headerSignature([['a'], ['b']], 2)).not.toBe(headerSignature([['a', 'b']], 2));
    });

    it('오른쪽 끝 빈 열, 전각, 폭 없는 문자, 공백 차이는 같은 헤더로 본다', () => {
        expect(headerSignature([['국어 ', 'ＡＢ', '수​학', '', '']], 1))
            .toBe(headerSignature([['국어', 'AB', '수학']], 1));
    });

    it('대교협 가채점의 1행이 전부 빈칸인 것도 지문에 들어간다', () => {
        const preview = SCHEMAS.daegyohyeop_preview;
        expect(preview.exportHeaders[0].every(c => c === '')).toBe(true);
        const shifted = {...preview, exportHeaders: preview.exportHeaders.slice(1), headerRows: 2};
        expect(schemaSignature(shifted)).not.toBe(schemaSignature(preview));
    });
});

describe.each(FORMATS)('자동 매칭: %s', (id) => {
    const headers = SCHEMAS[id].exportHeaders;

    it('ExcelJS 경로(.xlsx, 가로·세로 병합)로 읽어도 이 양식 하나만 맞는다', async () => {
        const wb = await loadWorkbook({name: 'a.xlsx', bytes: await xlsxBytes(headers)});
        expect(matchFormats(firstSheet(wb), SCHEMAS)).toEqual({candidates: [id], autoId: id});
    });

    it('SheetJS 경로(.xls, 병합 칸에 값이 남은 파일)로 읽어도 이 양식 하나만 맞는다', async () => {
        const wb = await loadWorkbook({name: 'a.xls', bytes: xlsBytes(headers)});
        expect(matchFormats(firstSheet(wb), SCHEMAS)).toEqual({candidates: [id], autoId: id});
    });
});

describe('자동 매칭: 고르지 않는 경우', () => {
    it('헤더가 하나 다르면 아무 양식도 고르지 않는다', async () => {
        const headers = SCHEMAS.daegyohyeop.exportHeaders.map(r => [...r]);
        headers[1][5] = '원점수(수정)';
        const wb = await loadWorkbook({name: 'a.xlsx', bytes: await xlsxBytes(headers)});
        expect(matchFormats(firstSheet(wb), SCHEMAS)).toEqual({candidates: [], autoId: null});
    });

    it('두 양식이 모두 맞으면 자동으로 고르지 않는다', async () => {
        const twin = (id) => new FormatSchema({...SCHEMAS.kimyoungil, id, fields: SCHEMAS.kimyoungil.fields});
        const schemas = {a: twin('a'), b: twin('b')};
        const wb = await loadWorkbook({name: 'a.xlsx', bytes: await xlsxBytes(SCHEMAS.kimyoungil.exportHeaders)});
        expect(matchFormats(firstSheet(wb), schemas)).toEqual({candidates: ['a', 'b'], autoId: null});
    });

    it('대교협(2줄) 파일을 대교협 가채점(3줄)으로, 그 반대로도 고르지 않는다', async () => {
        const a = await loadWorkbook({name: 'a.xlsx', bytes: await xlsxBytes(SCHEMAS.daegyohyeop.exportHeaders)});
        expect(matchFormats(firstSheet(a), SCHEMAS).candidates).not.toContain('daegyohyeop_preview');
        const b = await loadWorkbook({name: 'b.xlsx', bytes: await xlsxBytes(SCHEMAS.daegyohyeop_preview.exportHeaders)});
        expect(matchFormats(firstSheet(b), SCHEMAS).candidates).not.toContain('daegyohyeop');
    });
});

describe('왼쪽 빈 열', () => {
    // A열이 통째로 빈 파일은 SheetJS 의 !ref 가 B열에서 시작한다. A1 으로 고정하지 않으면 열이 한 칸씩 당겨진다
    const headers = [['', ...SCHEMAS.kimyoungil.exportHeaders[0]]];
    const leftBlank = new FormatSchema({...SCHEMAS.kimyoungil, id: 'leftBlank', exportHeaders: headers, fields: SCHEMAS.kimyoungil.fields});
    const schemas = {leftBlank, kimyoungil: SCHEMAS.kimyoungil};
    const withBlankA = (rows) => rows.map(r => r.map((v, i) => (i === 0 ? null : v)));

    it.each([['xlsx', async () => xlsxBytes(headers, {merge: false})], ['xls', async () => {
        const sheet = XLSX.utils.aoa_to_sheet(withBlankA([...headers, ['', 3, 4]]));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, '성적');
        return new Uint8Array(XLSX.write(wb, {type: 'array', bookType: 'xls'}));
    }]])('%s: 열 위치가 유지되어 한 칸 밀린 양식으로만 맞는다', async (ext, make) => {
        const wb = await loadWorkbook({name: `a.${ext}`, bytes: await make()});
        expect(matchFormats(firstSheet(wb), schemas)).toEqual({candidates: ['leftBlank'], autoId: 'leftBlank'});
    });
});

describe('zip 과 비밀번호 파일', () => {
    const PASSWORD = '비밀1234';
    let plain;
    let encrypted;

    beforeAll(async () => {
        if (!globalThis.crypto?.subtle) globalThis.crypto = crypto.webcrypto;
        plain = await xlsxBytes(SCHEMAS['univ-2015-grade3'].exportHeaders);
        encrypted = new Uint8Array(toContainer(encryptAgile(Buffer.from(plain), {password: PASSWORD})));
    });

    it('zip 안의 엑셀을 전개하고, 부산물·중첩 압축·엑셀 아닌 파일을 거른다', () => {
        const zip = zipSync({
            '3월.xlsx': plain,
            '폴더/4월.xls': xlsBytes(SCHEMAS.kimyoungil.exportHeaders),
            '__MACOSX/._3월.xlsx': new Uint8Array([1]),
            '~$잠금.xlsx': new Uint8Array([1]),
            '메모.txt': new TextEncoder().encode('x'),
            '안쪽.zip': zipSync({'x.xlsx': plain}),
        });
        const {files, skipped} = expandUploads([{name: '모의고사.zip', bytes: zip}]);
        expect(files.map(f => [f.name, f.container])).toEqual([['3월.xlsx', '모의고사.zip'], ['4월.xls', '모의고사.zip']]);
        expect(skipped).toEqual([{name: '안쪽.zip', reason: '압축 안의 압축은 해제하지 않습니다.'}]);
    });

    it('xlsx 는 zip 이어도 전개하지 않고 그대로 둔다', () => {
        const {files, skipped} = expandUploads([{name: '3월.xlsx', bytes: plain}, {name: '사진.png', bytes: new Uint8Array([1, 2])}]);
        expect(files.map(f => f.name)).toEqual(['3월.xlsx']);
        expect(skipped.map(s => s.name)).toEqual(['사진.png']);
    });

    it('한도를 넘는 압축은 통째로 거절한다', () => {
        const zip = zipSync({'a.xlsx': plain, 'b.xlsx': plain, 'c.xlsx': plain});
        const {files, skipped} = expandUploads([{name: 'x.zip', bytes: zip}], {limits: {maxEntries: 2, maxTotalBytes: 1e9}});
        expect(files).toEqual([]);
        expect(skipped[0].reason).toContain('너무 많습니다');
    });

    it('직접 올린 비밀번호 파일을 해제해 읽는다', async () => {
        const wb = await loadWorkbook({name: '3월.xlsx', bytes: encrypted}, {askPassword: async () => PASSWORD});
        expect(matchFormats(firstSheet(wb), SCHEMAS).autoId).toBe('univ-2015-grade3');
    });

    it('zip 안의 비밀번호 파일도 같은 경로로 해제해 읽는다', async () => {
        const {files} = expandUploads([{name: 'x.zip', bytes: zipSync({'3월.xlsx': encrypted})}]);
        expect(files).toHaveLength(1);
        let asked = 0;
        const wb = await loadWorkbook(files[0], {askPassword: async () => (asked++, PASSWORD)});
        expect(asked).toBe(1);
        expect(matchFormats(firstSheet(wb), SCHEMAS).autoId).toBe('univ-2015-grade3');
    });

    it('비밀번호가 틀리면 WrongPasswordError, 취소하면 null', async () => {
        await expect(loadWorkbook({name: 'a.xlsx', bytes: encrypted}, {askPassword: async () => '틀림'}))
            .rejects.toBeInstanceOf(WrongPasswordError);
        expect(await loadWorkbook({name: 'a.xlsx', bytes: encrypted}, {askPassword: async () => null})).toBeNull();
    });
});

describe('값 범위 교차검증', () => {
    const s = (o) => ({korean: {raw: 80, pct: 90, grade: 2}, inquiry1: {raw: 40}, ...o});
    it('범위 안이면 0', () => {
        expect(countOutOfRange([s()])).toBe(0);
    });
    it('백분위 0~100, 등급 1~9, 원점수 만점을 넘으면 센다', () => {
        expect(countOutOfRange([s({korean: {raw: 130, pct: 101, grade: 0}, inquiry1: {raw: 51}})])).toBe(4);
    });
});

describe('범위 밖 점수의 열별 개수', () => {
    it('어느 과목·종류에서 몇 개인지 많은 순으로 알린다', async () => {
        const {outOfRangeByColumn} = await import('../src/js/ingest/formatMatch.js');
        const s = {english: {grade: 0}, hist: {grade: 0, raw: 60}, korean: {pct: 120}};
        expect(outOfRangeByColumn([s, {english: {grade: 0}}])).toEqual([['영어 등급', 2], ['국어 백분위', 1], ['한국사 원점수', 1], ['한국사 등급', 1]]);
    });
});
