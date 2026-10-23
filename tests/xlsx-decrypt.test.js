import {beforeAll, describe, expect, it, vi} from 'vitest';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {aesEncrypt, encryptAgile as encryptAgileWith, le32, pad16, toContainer, utf16le} from './helpers/office-encrypt.js';
import {decryptXlsx, isCfbContainer, isEncryptedOfficeFile, readCfb, WrongPasswordError} from '../src/js/xlsx-decrypt.js';

/* 암호가 걸린 진짜 파일을 저장소에 넣어 두는 대신, 테스트에서 규격대로 직접
 * 암호화해 만든다. 모듈이 쓰는 WebCrypto 와 달리 여기서는 node:crypto 를 쓰므로
 * 구현이 서로를 베끼지 않는다. */

const PASSWORD = '비밀1234';
const SPIN = 100;   // 실제 파일은 10만이지만 테스트에서는 짧게 돈다

/** 원본 xlsx 한 벌. 4096바이트 세그먼트가 여러 개 나오도록 넉넉히 채운다. */
async function makePlainXlsx() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('성적');
    ws.addRow(['학년', '반', '번호', '이름', '점수']);
    for (let i = 1; i <= 300; i++) ws.addRow([3, 1 + (i % 9), i, `학생${i}`, i % 101]);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

const encryptAgile = (plain) => encryptAgileWith(plain, {password: PASSWORD, spin: SPIN});

/* ─── Standard (3.2) 암호화 ───────────────────────────── */

function standardKey(salt, keyBytes) {
    let h = crypto.createHash('sha1').update(Buffer.concat([salt, utf16le(PASSWORD)])).digest();
    for (let i = 0; i < 50000; i++) h = crypto.createHash('sha1').update(Buffer.concat([le32(i), h])).digest();
    h = crypto.createHash('sha1').update(Buffer.concat([h, le32(0)])).digest();

    const padTo64 = Buffer.concat([h, Buffer.alloc(64 - h.length, 0x36)]);
    const block = (fillByte) => {
        const b = Buffer.alloc(64, fillByte);
        for (let i = 0; i < 64; i++) b[i] ^= padTo64[i];
        return crypto.createHash('sha1').update(b).digest();
    };
    return Buffer.concat([block(0x36), block(0x5c)]).subarray(0, keyBytes);
}

function encryptStandard(plain) {
    const salt = crypto.randomBytes(16);
    const key = standardKey(salt, 16);
    const ecb = (data) => aesEncrypt('aes-128-ecb', key, null, data);

    const verifier = crypto.randomBytes(16);
    const verifierHash = pad16(crypto.createHash('sha1').update(verifier).digest()); // 20 → 32바이트

    const cspName = Buffer.concat([utf16le('Microsoft Enhanced RSA and AES Cryptographic Provider'), Buffer.alloc(2)]);
    const header = Buffer.concat([
        le32(0x24),     // Flags
        le32(0),        // SizeExtra
        le32(0x660E),   // AlgID: AES-128
        le32(0x8004),   // AlgIDHash: SHA-1
        le32(128),      // KeySize
        le32(0x18),     // ProviderType
        le32(0), le32(0),
        cspName,
    ]);
    const verifierBlock = Buffer.concat([
        le32(16), salt, ecb(verifier), le32(20), ecb(verifierHash),
    ]);
    const size = Buffer.alloc(8);
    size.writeBigUInt64LE(BigInt(plain.length), 0);

    return {
        info: Buffer.concat([
            Buffer.from([0x03, 0x00, 0x02, 0x00]), le32(0x24), le32(header.length), header, verifierBlock,
        ]),
        pkg: Buffer.concat([size, ecb(pad16(plain))]),
    };
}

describe('xlsx 암호 해제', () => {
    let plain;

    beforeAll(async () => {
        // jsdom 환경에는 WebCrypto 가 없을 수 있어 node 것을 얹어 준다.
        if (!globalThis.crypto?.subtle) globalThis.crypto = crypto.webcrypto;
        plain = await makePlainXlsx();
        expect(plain.length).toBeGreaterThan(4096); // 세그먼트가 여러 개여야 의미가 있다
    });

    it('CFB 시그니처로 암호화 여부를 가린다', () => {
        const bytes = toContainer(encryptAgile(Buffer.from('x')));
        expect(isEncryptedOfficeFile(new Uint8Array(bytes).buffer)).toBe(true);
        expect(isEncryptedOfficeFile(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]).buffer)).toBe(false);
        expect(isEncryptedOfficeFile(new Uint8Array([0x50]).buffer)).toBe(false);
    });

    // 옛 .xls 도 같은 OLE2 컨테이너다. 암호 정보가 없으면 암호 파일이 아니다.
    it('암호 정보가 없는 OLE2 파일(평범한 .xls)은 암호 파일로 보지 않는다', () => {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['이름'], ['학생1']]), 'S');
        const xls = new Uint8Array(XLSX.write(book, {type: 'array', bookType: 'biff8'}));
        expect(isCfbContainer(xls.buffer)).toBe(true);
        expect(isEncryptedOfficeFile(xls.buffer)).toBe(false);
    });

    it('Agile(4.4) 파일을 풀어 원본 xlsx 를 돌려준다', async () => {
        const out = await decryptXlsx(toContainer(encryptAgile(plain)), PASSWORD);
        expect(Buffer.from(out).equals(plain)).toBe(true);

        // 푼 결과를 ExcelJS 가 실제로 읽는지까지 본다
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(out);
        expect(wb.worksheets.map((ws) => ws.name)).toEqual(['성적']);
        expect(wb.getWorksheet('성적').getRow(2).getCell(4).value).toBe('학생1');
    });

    it('Standard(3.2) 파일을 풀어 원본 xlsx 를 돌려준다', async () => {
        const out = await decryptXlsx(toContainer(encryptStandard(plain)), PASSWORD);
        expect(Buffer.from(out).equals(plain)).toBe(true);
    });

    it('비밀번호가 틀리면 WrongPasswordError 를 던진다', async () => {
        const bytes = toContainer(encryptAgile(plain));
        await expect(decryptXlsx(bytes, '틀린암호')).rejects.toThrow(WrongPasswordError);
    });

    // 업로드 한 번에 암호 확인과 해제가 각자 컨테이너를 다시 읽었다
    it('미리 읽은 컨테이너를 넘기면 다시 읽지 않는다', async () => {
        const bytes = toContainer(encryptAgile(plain));
        const cfb = readCfb(new Uint8Array(bytes).buffer);
        const read = vi.spyOn(XLSX.CFB, 'read');
        try {
            expect(isEncryptedOfficeFile(bytes, cfb)).toBe(true);
            const out = await decryptXlsx(bytes, PASSWORD, cfb);
            expect(Buffer.from(out).equals(plain)).toBe(true);
            expect(read).not.toHaveBeenCalled();
        } finally {
            read.mockRestore();
        }
    });

    it('readCfb 는 컨테이너가 아니면 null 이다', () => {
        expect(readCfb(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]).buffer)).toBeNull();
        expect(readCfb(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 1]).buffer)).toBeNull();
    });

    it('지원하지 않는 버전은 그렇다고 알린다', async () => {
        const info = Buffer.from([0x04, 0x00, 0x03, 0x00, 0, 0, 0, 0]);
        const bytes = toContainer({info, pkg: Buffer.alloc(16)});
        await expect(decryptXlsx(bytes, PASSWORD)).rejects.toThrow('지원하지 않는 암호화 방식');
    });
});
