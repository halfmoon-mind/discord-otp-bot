import assert from 'node:assert';
import worker, { totp } from './worker.js';

// RFC 6238 부록 B SHA-1 벡터 (8자리 결과의 뒤 6자리)
const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
assert.equal(await totp(S, 59_000), '287082');
assert.equal(await totp(S, 1111111109_000), '081804');
// 구글이 보여주는 형식 (소문자 + 공백)
assert.equal(await totp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', 59_000), '287082');
// Base32의 끝 패딩도 허용
assert.equal(await totp('MZXW6YTBOI======', 59_000), await totp('MZXW6YTBOI', 59_000));

// 잘못된 키로 그럴듯한 OTP를 생성하지 않음
for (const secret of ['', '   ', '====', S.replace('G', '!'), S.replace('G', '0'), S.replace('G', '='), 'A', 'AAA', 'AAAAAA']) {
  await assert.rejects(totp(secret, 59_000), /Invalid Base32 TOTP secret/);
}

// 실제 서명 검증을 거치는 Discord 요청 (테스트용 키만 사용)
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex');
const env = { DISCORD_PUBLIC_KEY: publicKey, GUILD_ID: 'test-guild', TOTP_SECRET: S };
async function request(payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Buffer.from(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
  return new Request('https://example.invalid', {
    method: 'POST',
    body,
    headers: { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp },
  });
}

assert.deepEqual(await (await worker.fetch(await request({ type: 1 }), env)).json(), { type: 1 });
assert.equal((await worker.fetch(new Request('https://example.invalid', { method: 'POST', body: '{}' }), env)).status, 401);

for (const payload of [
  { type: 2, guild_id: env.GUILD_ID, data: { type: 1, name: 'other' } },
  { type: 3, guild_id: env.GUILD_ID, data: { custom_id: 'other', component_type: 2 } },
  { type: 4, guild_id: env.GUILD_ID, data: { type: 1, name: 'code' } },
  { type: 2, guild_id: env.GUILD_ID, data: { type: 2, name: 'code' } },
  { type: 2, guild_id: env.GUILD_ID },
]) {
  const response = await worker.fetch(await request(payload), env);
  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'unsupported interaction');
}

const command = { type: 2, guild_id: env.GUILD_ID, data: { type: 1, name: 'code' } };
const wrongGuild = await worker.fetch(await request({ ...command, guild_id: 'other-guild' }), env);
assert.equal((await wrongGuild.json()).data.content, '지정된 서버에서만 쓸 수 있음');

// 계산 중 30초 경계를 지나도 OTP와 남은 시간은 요청 처리 시각으로 일치
const codeRequest = await request(command);
const realNow = Date.now;
const times = [29_999, 30_000];
try {
  Date.now = () => times.shift() ?? 30_000;
  const response = await worker.fetch(codeRequest, env);
  assert.deepEqual(await response.json(), {
    type: 4,
    data: { content: `OTP: \`${await totp(S, 29_999)}\` (1초 남음)`, flags: 64 },
  });
} finally {
  Date.now = realNow;
}
console.log('ok');
