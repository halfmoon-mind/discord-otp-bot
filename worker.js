// Discord /code → 현재 OTP 코드를 요청한 사람에게만 보여줌 (ephemeral). 비밀번호는 봇이 다루지 않음.
export default {
  async fetch(req, env) {
    const body = await req.text();
    if (!(await verify(req, body, env.DISCORD_PUBLIC_KEY))) return new Response('bad signature', { status: 401 });

    const i = JSON.parse(body);
    if (i.type === 1) return Response.json({ type: 1 }); // Discord PING
    if (i.guild_id !== env.GUILD_ID) return reply('지정된 서버에서만 쓸 수 있음');

    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    return reply(`OTP: \`${await totp(env.TOTP_SECRET)}\` (${left}초 남음)`);
  },
};

const reply = (content) => Response.json({ type: 4, data: { content, flags: 64 } });
const hex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));

async function verify(req, body, publicKey) {
  const sig = req.headers.get('X-Signature-Ed25519');
  const ts = req.headers.get('X-Signature-Timestamp');
  if (!sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

// RFC 6238 TOTP (SHA-1, 30초, 6자리) — 구글 Authenticator와 동일
export async function totp(secret, now = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.toUpperCase().replace(/[\s=]/g, '')].map((c) => A.indexOf(c).toString(2).padStart(5, '0')).join('');
  const keyBytes = Uint8Array.from(bits.match(/.{8}/g), (b) => parseInt(b, 2));

  const msg = new DataView(new ArrayBuffer(8));
  msg.setBigUint64(0, BigInt(Math.floor(now / 30000)));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
  return String(n).padStart(6, '0');
}
