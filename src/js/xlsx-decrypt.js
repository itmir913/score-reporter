import * as XLSX from 'xlsx';

/* 암호가 걸린 xlsx 를 푸는 곳.
 *
 * Excel 이 암호를 걸면 결과물은 더 이상 zip 이 아니라 OLE2(CFB) 컨테이너다.
 * 그 안에 /EncryptionInfo 와 /EncryptedPackage 두 스트림이 들어 있고,
 * 후자를 풀어야 원래의 xlsx zip 이 나온다. ExcelJS 는 이 해제를 못 하고
 * (load 에 password 옵션 자체가 없다) SheetJS 커뮤니티 빌드도 마찬가지라,
 * "Can't find end of central directory" 로 끝난다. 그래서 직접 푼다.
 *
 * 규격은 MS-OFFCRYPTO. 두 가지를 지원한다.
 *   - Agile (버전 4.4, Excel 2010+ 기본): XML 헤더 + AES-CBC 세그먼트 암호화
 *   - Standard (버전 2.2/3.2/4.2, Excel 2007): 바이너리 헤더 + AES-ECB
 * 확장형(4.3)은 규격이 서드파티 CSP 에 맡기는 형태라 풀 수 없다.
 *
 * 해시와 AES 는 WebCrypto 를 쓴다. spinCount 가 10만인 파일도 순식간에 끝난다.
 * 다만 WebCrypto 에는 ECB 도, 패딩 없는 CBC 도 없어서 아래 두 헬퍼로 우회한다.
 */

const SUBTLE = () => {
    const s = globalThis.crypto && globalThis.crypto.subtle;
    if (!s) throw new Error('이 브라우저에서는 암호 해제를 지원하지 않습니다. (WebCrypto 없음)');
    return s;
};

const CFB_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/** 암호가 걸린 Office 파일(OLE2 컨테이너)인지 앞 8바이트로 본다. */
export function isEncryptedOfficeFile(buffer) {
    if (buffer.byteLength < 8) return false;
    const head = new Uint8Array(buffer, 0, 8);
    return CFB_MAGIC.every((b, i) => head[i] === b);
}

/* ─── 바이트 유틸 ─────────────────────────────────────── */

const u8 = (x) => (x instanceof Uint8Array ? x : new Uint8Array(x));

function concat(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

function le32(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
}

function utf16le(str) {
    const b = new Uint8Array(str.length * 2);
    const dv = new DataView(b.buffer);
    for (let i = 0; i < str.length; i++) dv.setUint16(i * 2, str.charCodeAt(i), true);
    return b;
}

function fromBase64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** 규격상 키와 IV 는 모자라면 0x36 으로 채우고 남으면 자른다. */
function fit(bytes, size) {
    if (bytes.length === size) return bytes;
    if (bytes.length > size) return bytes.slice(0, size);
    const out = new Uint8Array(size).fill(0x36);
    out.set(bytes);
    return out;
}

function xorInto(target, other) {
    for (let i = 0; i < target.length; i++) target[i] ^= other[i];
    return target;
}

function sameBytes(a, b, length) {
    for (let i = 0; i < length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/* ─── AES ─────────────────────────────────────────────── */

async function importAesKey(keyBytes) {
    return SUBTLE().importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt', 'decrypt']);
}

/* WebCrypto 의 AES-CBC 복호화는 PKCS#7 패딩을 반드시 벗겨내려 하는데, 이
 * 규격의 데이터에는 패딩이 없다. 그래서 마지막 블록 뒤에 "0x10 이 16개인 평문"을
 * 암호화한 블록 하나를 붙여 준다. 복호화기가 그것을 패딩으로 보고 걷어내면
 * 남는 것이 정확히 원래 평문이다. */
async function aesCbcDecrypt(key, iv, data) {
    const last = data.subarray(data.length - 16);
    const padded = u8(await SUBTLE().encrypt({name: 'AES-CBC', iv: last}, key, new Uint8Array(16).fill(16)));
    const withPad = concat(data, padded.subarray(0, 16));
    return u8(await SUBTLE().decrypt({name: 'AES-CBC', iv}, key, withPad));
}

/* ECB 도 없다. CBC 복호화 결과는 블록마다 D(C_i) XOR C_(i-1) 이므로,
 * 앞 블록의 암호문을 도로 XOR 하면 D(C_i), 즉 ECB 복호화 결과가 된다. */
async function aesEcbDecrypt(key, data) {
    const out = await aesCbcDecrypt(key, new Uint8Array(16), data);
    for (let off = 16; off < out.length; off += 16) {
        xorInto(out.subarray(off, off + 16), data.subarray(off - 16, off));
    }
    return out;
}

/* ─── 해시 ────────────────────────────────────────────── */

const HASH_NAMES = {sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512'};

function hashName(algorithm) {
    const name = HASH_NAMES[String(algorithm).toLowerCase().replace(/[-_]/g, '')];
    if (!name) throw new Error(`지원하지 않는 해시 알고리즘입니다: ${algorithm}`);
    return name;
}

async function hash(algo, ...parts) {
    return u8(await SUBTLE().digest(algo, concat(...parts)));
}

/* ─── Agile (4.4) ─────────────────────────────────────── */

const BLOCK_KEY_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BLOCK_KEY_VERIFIER_VALUE = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BLOCK_KEY_SECRET_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

/** 헤더 XML 에서 태그 하나를 찾아 속성을 객체로 뽑는다. */
function attrs(xml, tag) {
    const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>`));
    if (!m) throw new Error(`암호 정보(${tag})를 찾지 못했습니다.`);
    const out = {};
    for (const a of m[1].matchAll(/(\w+)="([^"]*)"/g)) out[a[1]] = a[2];
    return out;
}

/* 비밀번호를 spinCount 만큼 되풀이해 해시한다. 실제 파일은 10만 번이라 여기가
 * 전체 시간의 거의 전부다. 파생 키가 셋 필요하지만 회전은 셋이 공유하므로,
 * 한 번만 돌리고 blockKey 별 마지막 해시만 따로 한다. */
async function spinPassword(algo, password, salt, spinCount) {
    let h = await hash(algo, salt, utf16le(password));
    for (let i = 0; i < spinCount; i++) h = await hash(algo, le32(i), h);
    return h;
}

/** 회전이 끝난 해시에서 용도(blockKey)별 키를 뽑는다. */
async function deriveKey(algo, spun, blockKey, keyBytes) {
    return fit(await hash(algo, spun, blockKey), keyBytes);
}

function packageSize(bytes) {
    return Number(new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true));
}

async function decryptAgile(infoBytes, packageBytes, password) {
    const xml = new TextDecoder('utf-8').decode(infoBytes.subarray(8));
    const keyData = attrs(xml, 'keyData');
    const enc = attrs(xml, 'encryptedKey');

    const encAlgo = hashName(enc.hashAlgorithm);
    const encSalt = fromBase64(enc.saltValue);
    const encKeyBytes = Number(enc.keyBits) / 8;
    const spin = Number(enc.spinCount);

    const spun = await spinPassword(encAlgo, password, encSalt, spin);

    // 비밀번호 검증: 입력값을 풀어 해시한 값이 저장된 해시와 같아야 한다.
    const inputKey = await deriveKey(encAlgo, spun, BLOCK_KEY_VERIFIER_INPUT, encKeyBytes);
    const valueKey = await deriveKey(encAlgo, spun, BLOCK_KEY_VERIFIER_VALUE, encKeyBytes);
    const verifier = await aesCbcDecrypt(await importAesKey(inputKey), encSalt, fromBase64(enc.encryptedVerifierHashInput));
    const stored = await aesCbcDecrypt(await importAesKey(valueKey), encSalt, fromBase64(enc.encryptedVerifierHashValue));
    const actual = await hash(encAlgo, verifier);
    if (!sameBytes(stored, actual, actual.length)) throw new WrongPasswordError();

    // 패키지를 실제로 푸는 키는 파일이 따로 들고 있다. 비밀번호로는 그 키를 꺼낸다.
    const wrapKey = await deriveKey(encAlgo, spun, BLOCK_KEY_SECRET_KEY, encKeyBytes);
    const secret = (await aesCbcDecrypt(await importAesKey(wrapKey), encSalt, fromBase64(enc.encryptedKeyValue)))
        .subarray(0, encKeyBytes);

    // 패키지는 4096바이트 세그먼트마다 IV 를 새로 만들어 암호화되어 있다.
    const keyAlgo = hashName(keyData.hashAlgorithm);
    const keySalt = fromBase64(keyData.saltValue);
    const blockSize = Number(keyData.blockSize);
    const aesKey = await importAesKey(secret);

    const size = packageSize(packageBytes);
    const body = packageBytes.subarray(8);
    const out = new Uint8Array(size);
    const SEGMENT = 4096;

    for (let i = 0, off = 0; off < body.length; i++, off += SEGMENT) {
        const chunk = body.subarray(off, Math.min(off + SEGMENT, body.length));
        if (chunk.length % 16 !== 0) break; // 규격상 세그먼트는 항상 블록 단위다
        const iv = fit(await hash(keyAlgo, keySalt, le32(i)), blockSize);
        const plain = await aesCbcDecrypt(aesKey, iv, chunk);
        out.set(plain.subarray(0, Math.max(0, Math.min(plain.length, size - i * SEGMENT))), i * SEGMENT);
    }
    return out;
}

/* ─── Standard (2.2 / 3.2 / 4.2) ──────────────────────── */

/* 이쪽은 회전 수가 50000 으로 고정이고 해시는 언제나 SHA-1 이다. 마지막에
 * 0x36/0x5C 패딩을 얹어 두 번 해시한 값을 이어 붙인 것이 키가 된다. */
async function deriveStandardKey(password, salt, keyBytes) {
    let h = await hash('SHA-1', salt, utf16le(password));
    for (let i = 0; i < 50000; i++) h = await hash('SHA-1', le32(i), h);
    h = await hash('SHA-1', h, le32(0));

    const x1 = await hash('SHA-1', xorInto(new Uint8Array(64).fill(0x36), fit(h, 64)));
    const x2 = await hash('SHA-1', xorInto(new Uint8Array(64).fill(0x5c), fit(h, 64)));
    return concat(x1, x2).subarray(0, keyBytes);
}

async function decryptStandard(infoBytes, packageBytes, password) {
    const dv = new DataView(infoBytes.buffer, infoBytes.byteOffset, infoBytes.byteLength);
    const headerSize = dv.getUint32(8, true);
    const keyBits = dv.getUint32(12 + 16, true);   // EncryptionHeader 안의 KeySize
    const at = 12 + headerSize;                    // 뒤이어 EncryptionVerifier

    const saltSize = dv.getUint32(at, true);
    const salt = infoBytes.subarray(at + 4, at + 4 + saltSize);
    const encVerifier = infoBytes.subarray(at + 4 + saltSize, at + 20 + saltSize);
    const hashSize = dv.getUint32(at + 20 + saltSize, true);
    const encVerifierHash = infoBytes.subarray(at + 24 + saltSize, at + 24 + saltSize + 32);

    const key = await importAesKey(await deriveStandardKey(password, salt, keyBits / 8));
    const verifier = await aesEcbDecrypt(key, encVerifier);
    const stored = await aesEcbDecrypt(key, encVerifierHash);
    const actual = await hash('SHA-1', verifier);
    if (!sameBytes(stored, actual, hashSize)) throw new WrongPasswordError();

    const size = packageSize(packageBytes);
    const body = packageBytes.subarray(8, 8 + Math.floor((packageBytes.length - 8) / 16) * 16);
    return (await aesEcbDecrypt(key, body)).subarray(0, size);
}

/* ─── 입구 ────────────────────────────────────────────── */

export class WrongPasswordError extends Error {
    constructor() {
        super('비밀번호가 올바르지 않습니다.');
        this.name = 'WrongPasswordError';
    }
}

/**
 * 암호가 걸린 xlsx 를 풀어 원래의 xlsx(zip) 바이트로 돌려준다.
 *
 * @param {ArrayBuffer|Uint8Array} buffer 사용자가 올린 파일 그대로
 * @param {string} password 사용자가 입력한 비밀번호
 * @returns {Promise<Uint8Array>}
 */
export async function decryptXlsx(buffer, password) {
    const cfb = XLSX.CFB.read(u8(buffer), {type: 'array'});
    const info = XLSX.CFB.find(cfb, '/EncryptionInfo');
    const pkg = XLSX.CFB.find(cfb, '/EncryptedPackage');
    if (!info || !pkg) throw new Error('암호화된 Office 파일이 아닙니다.');

    const infoBytes = u8(info.content);
    const pkgBytes = u8(pkg.content);
    const major = infoBytes[0] | (infoBytes[1] << 8);
    const minor = infoBytes[2] | (infoBytes[3] << 8);

    if (major === 4 && minor === 4) return decryptAgile(infoBytes, pkgBytes, password);
    if (minor === 2 && major >= 2 && major <= 4) return decryptStandard(infoBytes, pkgBytes, password);
    throw new Error(`지원하지 않는 암호화 방식입니다. (버전 ${major}.${minor})`);
}
