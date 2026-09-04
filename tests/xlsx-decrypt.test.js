import {beforeAll, describe, expect, it} from 'vitest';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {decryptXlsx, isEncryptedOfficeFile, WrongPasswordError} from '../src/js/xlsx-decrypt.js';

/* 암호가 걸린 진짜 파일을 저장소에 넣어 두는 대신, 테스트에서 규격대로 직접
 * 암호화해 만든다. 모듈이 쓰는 WebCrypto 와 달리 여기서는 node:crypto 를 쓰므로
 * 구현이 서로를 베끼지 않는다. */

const PASSWORD = '비밀1234';
const SPIN = 100;   // 실제 파일은 10만이지만 테스트에서는 짧게 돈다

function le32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n, 0);
    return b;
}

const utf16le = (s) => Buffer.from(s, 'utf16le');

function aesEncrypt(algo, key, iv, data) {
    const c = crypto.createCipheriv(algo, key, iv);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(data), c.final()]);
}

function pad16(buf) {
    const rest = buf.length % 16;
    return rest === 0 ? buf : Buffer.concat([buf, Buffer.alloc(16 - rest)]);
}

/** 원본 xlsx 한 벌. 4096바이트 세그먼트가 여러 개 나오도록 넉넉히 채운다. */
async function makePlainXlsx() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('성적');
    ws.addRow(['학년', '반', '번호', '이름', '점수']);
    for (let i = 1; i <= 300; i++) ws.addRow([3, 1 + (i % 9), i, `학생${i}`, i % 101]);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ─── Agile (4.4) 암호화 ──────────────────────────────── */

function agileKey(algo, salt, blockKey, keyBytes) {
    let h = crypto.createHash(algo).update(Buffer.concat([salt, utf16le(PASSWORD)])).digest();
    for (let i = 0; i < SPIN; i++) h = crypto.createHash(algo).update(Buffer.concat([le32(i), h])).digest();
    const derived = crypto.createHash(algo).update(Buffer.concat([h, blockKey])).digest();
    return derived.length >= keyBytes
        ? derived.subarray(0, keyBytes)
        : Buffer.concat([derived, Buffer.alloc(keyBytes - derived.length, 0x36)]);
}

function encryptAgile(plain) {
    const keySalt = crypto.randomBytes(16);
    const encSalt = crypto.randomBytes(16);
    const secret = crypto.randomBytes(32);
    const verifier = crypto.randomBytes(16);
    const verifierHash = crypto.createHash('sha512').update(verifier).digest();

    const wrap = (blockKey, data) =>
        aesEncrypt('aes-256-cbc', agileKey('sha512', encSalt, blockKey, 32), encSalt, data);

    const encVerifierInput = wrap(Buffer.from([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]), verifier);
    const encVerifierHash = wrap(Buffer.from([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]), verifierHash);
    const encKeyValue = wrap(Buffer.from([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]), secret);

    const segments = [];
    for (let i = 0, off = 0; off < plain.length; i++, off += 4096) {
        const iv = crypto.createHash('sha512')
            .update(Buffer.concat([keySalt, le32(i)])).digest().subarray(0, 16);
        segments.push(aesEncrypt('aes-256-cbc', secret, iv, pad16(plain.subarray(off, off + 4096))));
    }
    const size = Buffer.alloc(8);
    size.writeBigUInt64LE(BigInt(plain.length), 0);

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption">
<keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${keySalt.toString('base64')}"/>
<keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password">
<p:encryptedKey spinCount="${SPIN}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${encSalt.toString('base64')}" encryptedVerifierHashInput="${encVerifierInput.toString('base64')}" encryptedVerifierHashValue="${encVerifierHash.toString('base64')}" encryptedKeyValue="${encKeyValue.toString('base64')}"/>
</keyEncryptor></keyEncryptors></encryption>`;

    return {
        info: Buffer.concat([Buffer.from([0x04, 0x00, 0x04, 0x00, 0x40, 0x00, 0x00, 0x00]), Buffer.from(xml, 'utf8')]),
        pkg: Buffer.concat([size, ...segments]),
    };
}

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

/** 두 스트림을 실제 CFB 컨테이너로 묶는다. Excel 이 내놓는 파일과 같은 모양이다. */
function toContainer({info, pkg}) {
    const cfb = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(cfb, '/EncryptionInfo', info);
    XLSX.CFB.utils.cfb_add(cfb, '/EncryptedPackage', pkg);
    return Buffer.from(XLSX.CFB.write(cfb, {type: 'buffer'}));
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

    it('지원하지 않는 버전은 그렇다고 알린다', async () => {
        const info = Buffer.from([0x04, 0x00, 0x03, 0x00, 0, 0, 0, 0]);
        const bytes = toContainer({info, pkg: Buffer.alloc(16)});
        await expect(decryptXlsx(bytes, PASSWORD)).rejects.toThrow('지원하지 않는 암호화 방식');
    });
});
