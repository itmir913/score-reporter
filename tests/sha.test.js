import {describe, expect, it} from 'vitest';
import crypto from 'node:crypto';
import {hashFn, sha1, sha256, sha384, sha512} from '../src/js/sha.js';

/* 기준값은 node:crypto 로 그때그때 만든다. 값을 적어 두는 것보다 경계 길이를
 * 넓게 훑을 수 있다. 블록 경계(55/56, 63/64, 111/112, 127/128)는 패딩이 한 블록
 * 더 늘어나는 자리라 따로 챙긴다. */

const CASES = [
    ['SHA-1', 'sha1', sha1],
    ['SHA-256', 'sha256', sha256],
    ['SHA-384', 'sha384', sha384],
    ['SHA-512', 'sha512', sha512],
];

const LENGTHS = [0, 1, 3, 55, 56, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 200, 1000, 4096];

const hex = (bytes) => Buffer.from(bytes).toString('hex');

describe('sha', () => {
    for (const [name, nodeName, fn] of CASES) {
        it(`${name} 가 node:crypto 와 같은 값을 낸다`, () => {
            for (const len of LENGTHS) {
                const data = crypto.randomBytes(len);
                expect(hex(fn(new Uint8Array(data))), `길이 ${len}`)
                    .toBe(crypto.createHash(nodeName).update(data).digest('hex'));
            }
        });
    }

    it('되풀이해 해시해도 어긋나지 않는다', () => {
        // 키 파생은 앞 결과를 다음 입력으로 넣는다. 한 번이라도 어긋나면 뒤가 전부 달라진다.
        let mine = new Uint8Array(64);
        let ref = Buffer.alloc(64);
        for (let i = 0; i < 500; i++) {
            mine = sha512(mine);
            ref = crypto.createHash('sha512').update(ref).digest();
        }
        expect(hex(mine)).toBe(ref.toString('hex'));
    });

    it('WebCrypto 와 같은 이름으로 함수를 고른다', () => {
        expect(hashFn('SHA-512')).toBe(sha512);
        expect(() => hashFn('MD5')).toThrow('지원하지 않는 해시');
    });
});
