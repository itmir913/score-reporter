import ExcelJS from 'exceljs';
import {unzipSync} from 'fflate';
import * as XLSX from 'xlsx';
import {
    decryptXlsx,
    EncryptedLegacyXlsError,
    isEncryptedOfficeFile,
    readCfb,
} from '../xlsx-decrypt.js';

/* ───────────────────────────────────────────
   § 업로드 → 통합 문서
   엑셀 여러 개든, 그것들을 담은 zip 이든 같은 경로를 탄다. zip 은 해제하는 단계가
   하나 더 있을 뿐이다. 분기를 만들면 zip 경로만 조용히 낡는다(암호 해제가 빠지는 등).
   admission-outcomes 의 src/ingest/files.js 를 옮겨 왔고, 암호 걸린 xlsx 처리를 더했다.
─────────────────────────────────────────── */

export const SHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/** 압축 폭탄 방어. 학교 자료 규모를 한참 넘는 선에서 자른다 */
export const ARCHIVE_LIMITS = {
    maxEntries: 200,
    maxTotalBytes: 512 * 1024 * 1024,
};

export function isSheetName(name) {
    const lower = String(name ?? '').toLowerCase();
    return SHEET_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** zip 여부는 확장자가 아니라 매직 바이트로 본다 */
export function isZipBytes(bytes) {
    return bytes?.length >= 4
        && bytes[0] === 0x50 && bytes[1] === 0x4b
        && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

/* zip 항목 이름 인코딩. 국내 압축 도구는 UTF-8 플래그 없이 CP949 로 적는 일이 많다.
 * 엄격한 UTF-8 → CP949 순으로 시도하고, 둘 다 안 되면 원래 이름을 둔다 */
export function decodeEntryName(name) {
    let hasHighByte = false;
    for (let i = 0; i < name.length; i++) {
        const code = name.charCodeAt(i);
        if (code > 0xff) return name;
        if (code >= 0x80) hasHighByte = true;
    }
    if (!hasHighByte) return name;
    const bytes = new Uint8Array(name.length);
    for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i);
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
        // UTF-8 이 아니다
    }
    try {
        const decoded = new TextDecoder('euc-kr').decode(bytes);
        if (!decoded.includes('�')) return decoded;
    } catch {
        // euc-kr 표가 없는 환경
    }
    return name;
}

const baseName = (entryName) => String(entryName).split(/[/\\]/).pop() ?? '';

/** macOS 부산물·숨김 파일·엑셀 잠금 파일 */
const isNoise = (entryName) => {
    const name = baseName(entryName);
    return entryName.startsWith('__MACOSX/') || name.startsWith('.') || name.startsWith('~$');
};

/**
 * 올린 것들을 엑셀 파일 목록으로 펼친다. zip 안의 zip 은 해제하지 않는다.
 * @param {{name: string, bytes: Uint8Array}[]} uploads
 * @returns {{files: {name: string, bytes: Uint8Array, container?: string}[], skipped: {name: string, reason: string}[]}}
 */
export function expandUploads(uploads, {limits = ARCHIVE_LIMITS} = {}) {
    const files = [];
    const skipped = [];

    for (const {name, bytes} of uploads) {
        // zip 이 아니면(xls, csv, 암호 걸린 xlsx 는 OLE2·텍스트다) 확장자로만 거른다
        if (!isZipBytes(bytes)) {
            if (isSheetName(name)) files.push({name, bytes});
            else skipped.push({name, reason: '엑셀 파일이 아닙니다.'});
            continue;
        }

        // xlsx 도 zip 이므로 먼저 오피스 문서인지 본다
        let officeMarker;
        try {
            officeMarker = unzipSync(bytes, {filter: entry => entry.name === '[Content_Types].xml'});
        } catch {
            skipped.push({name, reason: '압축을 해제할 수 없습니다.'});
            continue;
        }
        if (Object.keys(officeMarker).length > 0) {
            if (isSheetName(name)) files.push({name, bytes});
            else skipped.push({name, reason: '엑셀 파일이 아닙니다.'});
            continue;
        }

        // 해제하기 전에 개수·크기를 거른다. 다 풀고 재면 이미 늦다
        let seen = 0;
        let declaredBytes = 0;
        let tooMany = false;
        let tooLarge = false;
        const nested = [];
        let entries;
        try {
            entries = unzipSync(bytes, {
                filter: (entry) => {
                    if (isNoise(entry.name)) return false;
                    const inner = baseName(entry.name);
                    if (!isSheetName(inner)) {
                        if (inner.toLowerCase().endsWith('.zip')) nested.push(decodeEntryName(inner));
                        return false;
                    }
                    seen += 1;
                    if (seen > limits.maxEntries) {
                        tooMany = true;
                        return false;
                    }
                    declaredBytes += entry.originalSize ?? 0;
                    // 한도를 넘으면 그 압축은 통째로 거절한다. 앞쪽 일부만 들어오면 사람이 모른다
                    if (declaredBytes > limits.maxTotalBytes) {
                        tooLarge = true;
                        return false;
                    }
                    return true;
                },
            });
        } catch {
            skipped.push({name, reason: '압축을 해제할 수 없습니다.'});
            continue;
        }
        if (tooMany) {
            skipped.push({name, reason: `압축 안에 파일이 너무 많습니다(${seen}개 이상).`});
            continue;
        }
        if (tooLarge) {
            skipped.push({name, reason: '전체 용량이 너무 큽니다. 압축을 나눠 올려 주세요.'});
            continue;
        }
        for (const inner of nested) skipped.push({name: inner, reason: '압축 안의 압축은 해제하지 않습니다.'});

        let found = 0;
        for (const [entryName, innerBytes] of Object.entries(entries)) {
            if (!innerBytes?.length) continue;
            files.push({name: decodeEntryName(baseName(entryName)), bytes: innerBytes, container: name});
            found += 1;
        }
        if (found === 0) skipped.push({name, reason: '압축 안에 엑셀 파일이 없습니다.'});
    }
    return {files, skipped};
}

// SheetJS 시트를 A1 부터 시작하는 2차원 배열로 바꾼다.
// sheet_to_json 은 !ref 의 시작 칸부터 읽는다. 1행이나 A열이 통째로 비어 있으면
// !ref 가 A2·B1 같은 곳에서 시작하고, 그만큼 행·열이 앞으로 당겨진다. 그러면
// 머리글 행 수와 열 문자가 어긋나 첫 학생이 빠지거나 옆 열을 읽는다. 시작을 A1 로 고정한다.
export function sheetjsTo2DArray(sheet) {
    if (!sheet || !sheet['!ref']) return [];
    const {e} = XLSX.utils.decode_range(sheet['!ref']);
    return XLSX.utils.sheet_to_json(sheet, {header: 1, defval: null, range: {s: {r: 0, c: 0}, e}});
}

/**
 * 엑셀 파일 하나를 ExcelJS 통합 문서로 읽는다. 직접 올린 파일과 zip 안의 파일이 모두 여기를 지난다.
 * 암호 걸린 xlsx 는 askPassword() 로 비밀번호를 받아 먼저 푼다. null 을 돌려주면 취소다.
 * SheetJS 로 읽은 시트(xls·csv·속이 옛 xls 인 xlsx)에는 병합 범위를 ws.sheetjsMerges 로 남긴다
 * — 양식 지문을 낼 때 병합 칸을 같은 방식으로 다루기 위해서다.
 * @returns {Promise<ExcelJS.Workbook|null>}
 */
export async function loadWorkbook({name, bytes}, {askPassword, isCancelled = () => false} = {}) {
    const ext = String(name).split('.').pop().toLowerCase();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const wb = new ExcelJS.Workbook();

    // 확장자는 .xlsx 인데 속은 옛 .xls(OLE2) 인 파일이 있다. 암호 정보가 없으면 .xls 처럼 읽는다.
    // 컨테이너는 한 번만 읽어 암호 확인과 해제가 함께 쓴다
    const cfb = ext === 'xlsx' ? readCfb(buffer) : null;
    const isEncrypted = !!cfb && isEncryptedOfficeFile(buffer, cfb);
    const isLegacyXls = !!cfb && !isEncrypted;

    if (ext === 'xls' || ext === 'csv' || isLegacyXls) {
        let xlsWorkbook;
        if (ext === 'csv') {
            let csvText;
            try {
                csvText = new TextDecoder('utf-8', {fatal: true}).decode(buffer);
            } catch {
                csvText = new TextDecoder('euc-kr').decode(buffer);
            }
            xlsWorkbook = XLSX.read(csvText, {type: 'string'});
        } else {
            try {
                xlsWorkbook = XLSX.read(buffer, {type: 'array'});
            } catch (e) {
                // 암호가 걸린 옛 .xls 는 "손상된 파일" 이 아니다. 무엇을 하면 되는지 알린다.
                // 암호 정보(/EncryptionInfo)가 있는 것은 새 형식이 이름만 .xls 인 파일이라 뺀다
                if (/password-protected/i.test(e?.message) && (isLegacyXls || !isEncryptedOfficeFile(buffer))) {
                    throw new EncryptedLegacyXlsError();
                }
                throw e;
            }
        }
        xlsWorkbook.SheetNames.forEach(sheetName => {
            const sheet = xlsWorkbook.Sheets[sheetName];
            const ws = wb.addWorksheet(sheetName);
            ws.addRows(sheetjsTo2DArray(sheet));
            ws.sheetjsMerges = sheet['!merges'] || [];
        });
        return wb;
    }

    /* 암호가 걸린 xlsx 는 zip 이 아니라 OLE2 컨테이너로 저장된다. ExcelJS 는
     * 그걸 그대로 zip 으로 읽으려다 실패하므로, 먼저 우리가 풀어서 넘긴다. */
    let data = buffer;
    if (isEncrypted) {
        const pwd = await askPassword?.(name);
        if (isCancelled()) return null;
        if (pwd === null || pwd === undefined) return null;
        data = await decryptXlsx(buffer, pwd, cfb);
        if (isCancelled()) return null;
    }
    await wb.xlsx.load(data);
    return wb;
}
