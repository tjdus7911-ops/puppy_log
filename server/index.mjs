// 멍로드 프록시 서버 (의존성 없음, Node 18+)
// - POST /api/diary  : 여행 기록 → AI 여행 일기 (Anthropic Messages API)
// - GET  /api/places : 장소 키워드 검색 (카카오 로컬 API)
// API 키는 환경 변수에만 둡니다. 클라이언트(웹/앱)에는 이 서버 주소만 설정합니다.
//
// 실행: ANTHROPIC_API_KEY=... KAKAO_REST_API_KEY=... node server/index.mjs
// ⚠ 외부 API 실제 호출은 개발 환경 네트워크 제한으로 아직 검증하지 못했습니다.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? '*';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 20_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('payload too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const SYSTEM = `당신은 반려견과의 자동차 여행 기록을 짧은 한국어 일기로 정리합니다.
규칙:
- 입력 JSON에 있는 사실(날짜, 지역, 거리, 시간, 휴식 횟수, 방문 장소, 메모)만 사용합니다.
- 입력에 없는 장소·사건·음식·날씨를 지어내지 않습니다.
- 반려견의 감정이나 건강 상태를 단정하지 않습니다("행복했다", "피곤했다" 등 금지). 보호자 시점의 담백한 서술만 씁니다.
- 일기체(…했다), 3~5문단, 400자 이내. 일기 본문만 출력합니다.`;

async function diary(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: 'ANTHROPIC_API_KEY not set' });
  let input;
  try {
    input = await readJson(req);
  } catch {
    return send(res, 400, { error: 'invalid json' });
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: `여행 기록:\n${JSON.stringify(input)}` }],
    }),
  });
  if (!r.ok) return send(res, 502, { error: `upstream ${r.status}` });
  const body = await r.json();
  const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return send(res, 200, { text });
}

async function places(req, res, url) {
  if (!process.env.KAKAO_REST_API_KEY) return send(res, 503, { error: 'KAKAO_REST_API_KEY not set' });
  const q = url.searchParams;
  const k = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  k.searchParams.set('query', q.get('query') ?? '');
  k.searchParams.set('x', q.get('lng') ?? '');
  k.searchParams.set('y', q.get('lat') ?? '');
  k.searchParams.set('radius', String(Math.min(20000, Number(q.get('radius') ?? 5000))));
  k.searchParams.set('sort', 'distance');
  const r = await fetch(k, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } });
  if (!r.ok) return send(res, 502, { error: `upstream ${r.status}` });
  const body = await r.json();
  return send(res, 200, {
    places: (body.documents ?? []).map((d) => ({
      id: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      latitude: Number(d.y),
      longitude: Number(d.x),
      phone: d.phone || null,
    })),
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'POST' && url.pathname === '/api/diary') return await diary(req, res);
    if (req.method === 'GET' && url.pathname === '/api/places') return await places(req, res, url);
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, () => console.log(`mungroad proxy on :${PORT}`));
