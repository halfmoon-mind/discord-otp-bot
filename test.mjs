import assert from 'node:assert';
import { totp } from './worker.js';

// RFC 6238 부록 B SHA-1 벡터 (8자리 결과의 뒤 6자리)
const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
assert.equal(await totp(S, 59_000), '287082');
assert.equal(await totp(S, 1111111109_000), '081804');
// 구글이 보여주는 형식 (소문자 + 공백)
assert.equal(await totp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', 59_000), '287082');
console.log('ok');
