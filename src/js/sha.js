/* SHA-1 / SHA-256 / SHA-384 / SHA-512 를 동기 함수로 구현한 것.
 *
 * WebCrypto 에도 같은 해시가 있지만 그쪽은 호출마다 Promise 와 구조화 복제를
 * 거친다. 한 번 부르는 값이면 문제가 없는데, 암호 해제의 키 파생은 64바이트짜리
 * 입력을 spinCount(보통 10만) 번 되풀이해 해시한다. 그 자리에서는 호출 한 번의
 * 고정 비용이 해시 자체보다 훨씬 크고, 실제로 파일 하나에 십수 초가 걸렸다.
 * 그래서 이 자리에서만 쓰려고 직접 구현한다.
 *
 * 상수는 규격대로 소수의 세제곱근·제곱근 소수부에서 뽑은 값이다.
 * 64비트가 필요한 SHA-384/512 는 32비트 상·하위 한 쌍으로 나눠서 다룬다.
 */

const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H256 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

const K512 = new Uint32Array([
    0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f,
    0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
    0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242,
    0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
    0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235,
    0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
    0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275,
    0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
    0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f,
    0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
    0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70, 0x27b70a85, 0x46d22ffc,
    0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
    0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6,
    0x92722c85, 0x1482353b, 0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
    0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218,
    0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
    0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99,
    0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
    0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc,
    0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
    0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915,
    0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
    0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba,
    0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
    0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc,
    0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
    0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
]);

const H512 = new Uint32Array([
    0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b,
    0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f,
    0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
]);

const H384 = new Uint32Array([
    0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17,
    0x152fecd8, 0xf70e5939, 0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511,
    0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
]);

/* 스크래치 버퍼는 호출마다 새로 만들지 않고 돌려 쓴다. 회전 루프에서는 같은
 * 길이의 입력을 수십만 번 해시하므로, 할당이 해시 자체만큼 비싸다.
 * 동기 함수라 중간에 끼어드는 호출이 없어서 공유해도 안전하다. */
const SCRATCH = new Map();

function scratch(bytes) {
    let buf = SCRATCH.get(bytes);
    if (!buf) SCRATCH.set(bytes, (buf = new Uint8Array(bytes)));
    else buf.fill(0);
    return buf;
}

const W1 = new Int32Array(80);
const W256 = new Uint32Array(64);
const W512 = new Uint32Array(160);

const rotl = (x, n) => (x << n) | (x >>> (32 - n));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** 규격의 패딩: 0x80 한 바이트, 0 채움, 마지막에 비트 길이(빅엔디언). */
function padded(msg, blockBytes) {
    const lenBytes = blockBytes === 128 ? 16 : 8;
    const total = Math.ceil((msg.length + 1 + lenBytes) / blockBytes) * blockBytes;
    const out = scratch(total);
    out.set(msg);
    out[msg.length] = 0x80;
    const bits = msg.length * 8;
    const dv = new DataView(out.buffer);
    dv.setUint32(total - 8, Math.floor(bits / 0x100000000), false);
    dv.setUint32(total - 4, bits >>> 0, false);
    return out;
}

function toBytes(state, byteLength) {
    const out = new Uint8Array(byteLength);
    const dv = new DataView(out.buffer);
    for (let i = 0; i * 4 < byteLength; i++) dv.setUint32(i * 4, state[i], false);
    return out;
}

export function sha1(msg) {
    const h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0]);
    const data = padded(msg, 64);
    const dv = new DataView(data.buffer);
    const w = W1;

    for (let off = 0; off < data.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
        for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

        let [a, b, c, d, e] = h;
        for (let i = 0; i < 80; i++) {
            let f, k;
            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5a827999;
            } else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ed9eba1;
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8f1bbcdc | 0;
            } else {
                f = b ^ c ^ d;
                k = 0xca62c1d6 | 0;
            }
            const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
            e = d;
            d = c;
            c = rotl(b, 30);
            b = a;
            a = t;
        }
        h[0] = (h[0] + a) | 0;
        h[1] = (h[1] + b) | 0;
        h[2] = (h[2] + c) | 0;
        h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0;
    }
    return toBytes(new Uint32Array(h.buffer), 20);
}

export function sha256(msg) {
    const h = Uint32Array.from(H256);
    const data = padded(msg, 64);
    const dv = new DataView(data.buffer);
    const w = W256;

    for (let off = 0; off < data.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const x = w[i - 15], y = w[i - 2];
            const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
            const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + s1 + ch + K256[i] + w[i]) >>> 0;
            const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (s0 + maj) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0;
        h[1] = (h[1] + b) >>> 0;
        h[2] = (h[2] + c) >>> 0;
        h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0;
        h[5] = (h[5] + f) >>> 0;
        h[6] = (h[6] + g) >>> 0;
        h[7] = (h[7] + hh) >>> 0;
    }
    return toBytes(h, 32);
}

/* SHA-384 과 SHA-512 는 초기값과 결과 길이만 다르고 나머지가 같다.
 * 64비트 값은 [상위, 하위] 두 칸으로 늘어놓고, 자리올림을 직접 얹는다.
 * 비트 연산 결과는 부호 있는 32비트라서, 자리올림을 비교로 알아내기 전에
 * >>> 0 으로 부호를 떼어 둔다. 안 그러면 음수와의 비교가 어긋난다. */
function sha512Core(msg, init, byteLength) {
    const h = Uint32Array.from(init);
    const data = padded(msg, 128);
    const dv = new DataView(data.buffer);
    const w = W512;

    for (let off = 0; off < data.length; off += 128) {
        for (let i = 0; i < 32; i++) w[i] = dv.getUint32(off + i * 4, false);

        for (let i = 16; i < 80; i++) {
            const p = i * 2;
            const xh = w[p - 30], xl = w[p - 29];   // w[i-15]
            const s0h = (((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7)) >>> 0;
            const s0l = (((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25))) >>> 0;
            const yh = w[p - 4], yl = w[p - 3];     // w[i-2]
            const s1h = (((yh >>> 19) | (yl << 13)) ^ ((yl >>> 29) | (yh << 3)) ^ (yh >>> 6)) >>> 0;
            const s1l = (((yl >>> 19) | (yh << 13)) ^ ((yh >>> 29) | (yl << 3)) ^ ((yl >>> 6) | (yh << 26))) >>> 0;

            // w[i] = w[i-16] + s0 + w[i-7] + s1
            let lo = (w[p - 31] + s0l) >>> 0;
            let hi = (w[p - 32] + s0h + (lo < s0l ? 1 : 0)) >>> 0;
            let prev = lo;
            lo = (lo + w[p - 13]) >>> 0;
            hi = (hi + w[p - 14] + (lo < prev ? 1 : 0)) >>> 0;
            prev = lo;
            lo = (lo + s1l) >>> 0;
            hi = (hi + s1h + (lo < prev ? 1 : 0)) >>> 0;
            w[p] = hi;
            w[p + 1] = lo;
        }

        let ah = h[0], al = h[1], bh = h[2], bl = h[3], ch = h[4], cl = h[5], dh = h[6], dl = h[7];
        let eh = h[8], el = h[9], fh = h[10], fl = h[11], gh = h[12], gl = h[13], hhh = h[14], hhl = h[15];

        for (let i = 0; i < 80; i++) {
            const s1h = (((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23))) >>> 0;
            const s1l = (((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23))) >>> 0;
            const chh = ((eh & fh) ^ (~eh & gh)) >>> 0;
            const chl = ((el & fl) ^ (~el & gl)) >>> 0;
            const s0h = (((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25))) >>> 0;
            const s0l = (((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25))) >>> 0;
            const majh = ((ah & bh) ^ (ah & ch) ^ (bh & ch)) >>> 0;
            const majl = ((al & bl) ^ (al & cl) ^ (bl & cl)) >>> 0;

            // t1 = h + S1 + ch + K + W
            let lo = (hhl + s1l) >>> 0;
            let hi = (hhh + s1h + (lo < s1l ? 1 : 0)) >>> 0;
            let prev = lo;
            lo = (lo + chl) >>> 0;
            hi = (hi + chh + (lo < prev ? 1 : 0)) >>> 0;
            prev = lo;
            lo = (lo + K512[i * 2 + 1]) >>> 0;
            hi = (hi + K512[i * 2] + (lo < prev ? 1 : 0)) >>> 0;
            prev = lo;
            lo = (lo + w[i * 2 + 1]) >>> 0;
            hi = (hi + w[i * 2] + (lo < prev ? 1 : 0)) >>> 0;
            const t1h = hi, t1l = lo;

            // t2 = S0 + maj
            const t2l = (s0l + majl) >>> 0;
            const t2h = (s0h + majh + (t2l < majl ? 1 : 0)) >>> 0;

            hhh = gh;
            hhl = gl;
            gh = fh;
            gl = fl;
            fh = eh;
            fl = el;
            lo = (dl + t1l) >>> 0;
            eh = (dh + t1h + (lo < t1l ? 1 : 0)) >>> 0;
            el = lo;
            dh = ch;
            dl = cl;
            ch = bh;
            cl = bl;
            bh = ah;
            bl = al;
            lo = (t1l + t2l) >>> 0;
            ah = (t1h + t2h + (lo < t2l ? 1 : 0)) >>> 0;
            al = lo;
        }

        const add = (idx, hi, lo) => {
            const l = (h[idx + 1] + lo) >>> 0;
            h[idx] = (h[idx] + hi + (l < lo ? 1 : 0)) >>> 0;
            h[idx + 1] = l;
        };
        add(0, ah, al);
        add(2, bh, bl);
        add(4, ch, cl);
        add(6, dh, dl);
        add(8, eh, el);
        add(10, fh, fl);
        add(12, gh, gl);
        add(14, hhh, hhl);
    }
    return toBytes(h, byteLength);
}

export const sha512 = (msg) => sha512Core(msg, H512, 64);
export const sha384 = (msg) => sha512Core(msg, H384, 48);

const BY_NAME = {'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512};

/** WebCrypto 와 같은 이름('SHA-512' 등)으로 해시 함수를 고른다. */
export function hashFn(name) {
    const fn = BY_NAME[name];
    if (!fn) throw new Error(`지원하지 않는 해시 알고리즘입니다: ${name}`);
    return fn;
}
