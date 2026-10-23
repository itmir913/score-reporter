import crypto from 'node:crypto';
import * as XLSX from 'xlsx';

/* 비밀번호 걸린 xlsx 를 테스트에서 규격대로 직접 만든다(xlsx-decrypt.test.js 에서 옮김).
 * 모듈이 쓰는 WebCrypto 와 달리 node:crypto 를 써서 구현이 서로를 베끼지 않는다. */

export function le32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n, 0);
    return b;
}

export const utf16le = (s) => Buffer.from(s, 'utf16le');

export function aesEncrypt(algo, key, iv, data) {
    const c = crypto.createCipheriv(algo, key, iv);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(data), c.final()]);
}

export function pad16(buf) {
    const rest = buf.length % 16;
    return rest === 0 ? buf : Buffer.concat([buf, Buffer.alloc(16 - rest)]);
}

/* ─── Agile (4.4) 암호화 ──────────────────────────────── */

function agileKey(algo, salt, blockKey, keyBytes, password, spin) {
    let h = crypto.createHash(algo).update(Buffer.concat([salt, utf16le(password)])).digest();
    for (let i = 0; i < spin; i++) h = crypto.createHash(algo).update(Buffer.concat([le32(i), h])).digest();
    const derived = crypto.createHash(algo).update(Buffer.concat([h, blockKey])).digest();
    return derived.length >= keyBytes
        ? derived.subarray(0, keyBytes)
        : Buffer.concat([derived, Buffer.alloc(keyBytes - derived.length, 0x36)]);
}

export function encryptAgile(plain, {password, spin = 100}) {
    const keySalt = crypto.randomBytes(16);
    const encSalt = crypto.randomBytes(16);
    const secret = crypto.randomBytes(32);
    const verifier = crypto.randomBytes(16);
    const verifierHash = crypto.createHash('sha512').update(verifier).digest();

    const wrap = (blockKey, data) =>
        aesEncrypt('aes-256-cbc', agileKey('sha512', encSalt, blockKey, 32, password, spin), encSalt, data);

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
<p:encryptedKey spinCount="${spin}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${encSalt.toString('base64')}" encryptedVerifierHashInput="${encVerifierInput.toString('base64')}" encryptedVerifierHashValue="${encVerifierHash.toString('base64')}" encryptedKeyValue="${encKeyValue.toString('base64')}"/>
</keyEncryptor></keyEncryptors></encryption>`;

    return {
        info: Buffer.concat([Buffer.from([0x04, 0x00, 0x04, 0x00, 0x40, 0x00, 0x00, 0x00]), Buffer.from(xml, 'utf8')]),
        pkg: Buffer.concat([size, ...segments]),
    };
}

export /** 두 스트림을 실제 CFB 컨테이너로 묶는다. Excel 이 내놓는 파일과 같은 모양이다. */
function toContainer({info, pkg}) {
    const cfb = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(cfb, '/EncryptionInfo', info);
    XLSX.CFB.utils.cfb_add(cfb, '/EncryptedPackage', pkg);
    return Buffer.from(XLSX.CFB.write(cfb, {type: 'buffer'}));
}

