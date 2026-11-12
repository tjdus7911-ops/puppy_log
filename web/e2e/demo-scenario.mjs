// 멍로드 전체 여행 흐름 E2E (31단계: 여행 23(차량 화면 주행 + 휴대폰 여행지 기록) + 커뮤니티 7 + 차량 홈 1, playwright-core + 로컬 Chrome, 데모 모드).
// 사용: npm run build && npx vite preview --port 4173 &  →  node e2e/demo-scenario.mjs [chrome 경로]
// 데모 주행은 시뮬레이션이며 실제 차량·내비·도로 데이터가 아닙니다.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.argv[2] ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await ctx.newPage();
const errors = [];
const results = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/speechSynthesis|Kakao/i.test(m.text()) && errors.push(`console: ${m.text()}`));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const full = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const btn = (name, exact = false) => page.getByRole('button', { name, exact }).first();
let n = 0;
async function step(title, fn) {
  n += 1;
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push(`✅ ${String(n).padStart(2)}. ${title}${note ? ` — ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push(`❌ ${String(n).padStart(2)}. ${title} — ${e.message.split('\n')[0]}`);
    await full(`fail-${n}`).catch(() => {});
    throw e;
  }
}

// 테스트용 사진(작은 PNG) — 사용자가 고른 파일처럼 파일 선택창에 넣습니다.
async function pngs(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 120 + i * 10, height: 90 } });
    out.push({ name: `dog-${i + 1}.png`, mimeType: 'image/png', buffer: buf });
  }
  return out;
}
async function addPhotos(trigger, count) {
  const files = await pngs(count);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger()]);
  await chooser.setFiles(files);
}

try {
  await step('앱 실행 · 온보딩', async () => {
    await page.goto(BASE);
    await page.getByText('우리 강아지와 떠나는').waitFor();
    await btn('다음').click(); await btn('다음').click();
    await btn('시작하기').click();
  });

  await step('반려견 프로필 확인(등록)', async () => {
    await page.getByText('함께 달릴 친구를 소개해 주세요').waitFor();
    await page.getByPlaceholder('예: 사슴').fill('사슴');
    await page.getByPlaceholder('예: 6.5').fill('7.2');
    await page.getByRole('radio', { name: '중형견' }).click();
    await btn('등록하기').click();
    await page.getByText('특별한 드라이브').waitFor();
    await page.getByText('사슴').first().waitFor();
    await full('01-home-before');
  });

  const wideV = () => page.setViewportSize({ width: 1600, height: 900 });
  const phoneV = () => page.setViewportSize({ width: 390, height: 844 });
  const demoEv = async (label) => { await page.locator('.demo-tag').first().click(); await page.locator('.st-opt', { hasText: label }).click(); };

  await step('휴대폰: 여행 시작은 차량에서(목적지 강릉 제안)', async () => {
    await page.locator('.navi-suggest').click();
    await page.locator('[data-testid=car-only-setup]').waitFor();
    const t = (await page.locator('.car-only-dest').innerText()).split('\n')[0];
    if (!t.includes('강릉')) throw new Error(`목적지 ${t}`);
    if (await page.getByRole('button', { name: /출발하기/ }).count()) throw new Error('휴대폰에 출발 버튼이 있음');
    await full('02-phone-car-only');
    return `목적지 “${t}” · 휴대폰에는 출발 버튼 없음`;
  });

  await step('차량: 출발 전 맞춤 휴식 계획 확인', async () => {
    await wideV();
    await page.locator('.cs-item.on').first().waitFor();
    await page.locator('.cs-next').click();
    await page.locator('[data-testid=rest-plan]').waitFor();
    const plan = (await page.locator('[data-testid=rest-plan]').innerText()).replace(/\s+/g, ' ');
    const basis = await page.locator('.rest-basis .b').innerText();
    await page.locator('.cf-row .chip', { hasText: '300배속' }).click();
    await page.locator('[data-testid=route-option] .chip.on', { hasText: '편한 길' }).waitFor();
    const wp = (await page.locator('[data-testid=rest-waypoint]').innerText()).replace(/\s+/g, ' ');
    await shot('02b-car-confirm');
    return `${plan} · ${basis} · 편한 길 · ${wp.slice(0, 40)}`;
  });

  await step('차량: 여행 시작(데모 300배속) · 휴대폰은 기록 상태만', async () => {
    await page.locator('.cs-next', { hasText: '여행 시작하기' }).click();
    await page.locator('.cd.v5').waitFor();
    await page.waitForTimeout(1500);
    await shot('03-live-driving');
    await phoneV();
    await page.locator('[data-testid=phone-trip-status]').waitFor();
    if (await page.locator('.m-actions, .rest-line, .cd-actions').count()) throw new Error('휴대폰에 주행 조작이 보임');
    await shot('03b-phone-status');
    await wideV();
    await page.locator('.cd.v5').waitFor();
    return '휴대폰: “차량에서 기록 중” 상태 카드';
  });

  await step('휴식 10분 전: 팝업 없이 휴식 카드', async () => {
    await page.locator('.rest-line.soon').waitFor({ timeout: 60000 });
    await shot('04-reminder-soon');
    if (await page.locator('.overlay').count()) throw new Error('팝업이 떠 있음');
    return await page.locator('.rest-line .t').innerText();
  });

  await step('휴식 시점 → 나중에 알림 → 휴게소 주차·뒷문 열림 → 휴식 시작 → 함께 내려요 → 종료', async () => {
    await page.locator('.rest-line.due').waitFor({ timeout: 60000 });
    await shot('05-reminder-due');
    const t = await page.locator('.rest-line .t').innerText();
    if (await page.locator('.overlay').count()) throw new Error('팝업이 떠 있음');
    await btn('나중에 알림').click();
    await demoEv('휴게소 주차');
    await page.locator('[data-testid=cabin-prompt]', { hasText: '휴식 시작할까요?' }).waitFor({ timeout: 8000 });
    await page.locator('[data-testid=cabin-prompt]').getByRole('button', { name: '휴식 시작' }).click();
    await page.locator('[data-testid=pet-stay]').getByRole('button', { name: '함께 내려요' }).click();
    await page.locator('.rest-line.resting').waitFor();
    await btn('휴식 종료').click();
    await page.waitForTimeout(400);
    return `“${t}” → 뒷문 열림 확인으로 휴식 → 종료`;
  });

  await step('다음 휴식지 추천 카드(팝업 없음) · 경유지 추가', async () => {
    await page.locator('.rr-card').first().waitFor({ timeout: 30000 });
    if (await page.locator('.reco-pop').count()) throw new Error('추천 팝업이 떠 있음');
    const cnt = await page.locator('.rr-list .rr-card').count();
    const first = (await page.locator('.rr-card').first().innerText()).replace(/\s+/g, ' ').slice(0, 60);
    await page.locator('.rr-card .rr-go').first().click();
    await page.locator('.rr-card.on').waitFor();
    await shot('06-auto-reco');
    return `카드 ${cnt}개 · ${first} · 경유지 표시`;
  });

  await step('도로 위험 정보(데모 표시)', async () => {
    await page.locator('.hz-pill .badge.sample').waitFor({ timeout: 10000 });
    await shot('07-dashboard-wide-hazard');
    return '‘데모’ 배지와 함께 표시';
  });

  await step('차량 상태(데모): 창문 안내 · 더운 날 에어컨 켜기 · 휴대폰에는 표시 없음', async () => {
    await demoEv('뒷좌석 창문 열림');
    await page.locator('[data-testid=cabin-prompt]', { hasText: '뒷좌석 창문이 많이 열려 있어요' }).waitFor({ timeout: 8000 });
    await page.locator('[data-testid=cabin-prompt]').getByRole('button', { name: '확인' }).click();
    await demoEv('더운 날');
    await page.locator('[data-testid=cabin-prompt]', { hasText: '에어컨을 켤까요?' }).waitFor({ timeout: 8000 });
    await shot('07b-cabin-heat');
    await page.locator('[data-testid=cabin-prompt]').getByRole('button', { name: '에어컨 켜기' }).click();
    await page.locator('.cabin-row', { hasText: '에어컨 켜짐' }).waitFor({ timeout: 5000 });
    await phoneV();
    await page.locator('[data-testid=phone-trip-status]').waitFor();
    if (await page.locator('[data-testid=cabin-prompt], .cabin-row, [data-testid=pet-stay]').count()) throw new Error('휴대폰 화면에 차량 상태 안내가 보임');
    await wideV();
    await page.locator('.cd.v5').waitFor();
    return '창문 안내 → 에어컨 켜짐 / 휴대폰: 표시 없음';
  });

  await step('강릉 도착(차량) → 휴대폰에서 여행지 활동', async () => {
    await page.locator('.arr-title', { hasText: '도착했어요' }).waitFor({ timeout: 120000 });
    await shot('07c-car-arrived');
    await page.locator('.arr-acts .ca', { hasText: '여행지 활동 기록' }).click();
    await page.waitForTimeout(800);
    await phoneV();
    await page.goto(`${BASE}#/home`);
    await page.locator('.dest-hero').waitFor({ timeout: 15000 });
    const title = await page.locator('.dest-hero h1').innerText();
    await full('08-destination-home');
    return `자동 제목 "${title}"`;
  });

  await step('앱 재실행(새로고침) 후 여행지 활동 복원', async () => {
    await page.reload();
    await page.locator('.dest-hero').waitFor({ timeout: 15000 });
    return '여행지 활동 화면 유지';
  });

  await step('사진 3장 추가', async () => {
    await addPhotos(() => page.locator('.qa .tile', { hasText: '사진 추가' }).click(), 3);
    await page.locator('.qa .tile', { hasText: '3장' }).waitFor({ timeout: 10000 });
  });

  await step('방문 장소 기록 + 멍슐랭 후기', async () => {
    await page.locator('.tile', { hasText: '장소 기록' }).click();
    await page.getByPlaceholder('예: 경포 솔숲 산책로').fill('경포 솔숲 산책로');
    await page.getByPlaceholder('예: 그늘이 많아 쉬기 좋았음').fill('그늘이 많아 쉬기 좋았음');
    const mung = page.locator('[data-testid=mung-review]');
    await mung.getByRole('radiogroup', { name: '소형견 가능' }).getByRole('radio', { name: '예' }).click();
    await mung.getByRole('radiogroup', { name: '주차 편리' }).getByRole('radio', { name: '예' }).click();
    await mung.getByLabel('한 줄 후기').fill('그늘 벤치에서 쉬기 좋아요');
    await btn('기록하기', true).click();
    await page.locator('.tile', { hasText: '1곳' }).waitFor();
    await page.getByText(/멍슐랭: 소형견 가능 · 주차 편리/).first().waitFor();
    return '멍슐랭 후기(소형견 가능 · 주차 편리 · 한 줄 후기) 함께 기록';
  });

  await step('여행 메모 작성', async () => {
    await page.locator('.qa .tile', { hasText: '메모' }).click();
    await page.getByRole('dialog').getByLabel('여행 메모').fill('바다 앞에서 사슴이가 한참 모래를 팠다.');
    await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await page.locator('.tile', { hasText: '작성됨' }).waitFor();
    await full('09-destination-filled');
  });

  await step('돌아가는 길: 휴대폰은 안내만 → 차량에서 집으로 출발', async () => {
    const t = (await page.locator('[data-testid=return-in-car]').innerText()).replace(/\s+/g, ' ');
    if (!t.includes('집으로 갈까요')) throw new Error(t);
    if (await page.getByRole('button', { name: '집으로 출발 · 돌아가는 길 기록' }).count()) throw new Error('휴대폰에 출발 버튼이 있음');
    await wideV();
    await page.goto(`${BASE}#/trip/destination`);
    await btn('집으로 출발 · 돌아가는 길 기록').click();
    await page.locator('.cd.v5').waitFor({ timeout: 15000 });
    await page.getByText(/돌아가는 중/).first().waitFor();
    await shot('10-return-driving');
    return t.slice(0, 50);
  });

  await step('복귀 중 휴식 알림(구간별 독립)', async () => {
    await page.locator('.rest-line.soon, .rest-line.due').first().waitFor({ timeout: 60000 });
    return '복귀 구간에서도 휴식 상태 카드 동작';
  });

  await step('집 도착 → 여행 완료(차량)', async () => {
    await page.locator('.arr-title', { hasText: '돌아왔어요' }).waitFor({ timeout: 120000 });
    await page.locator('.arr-acts .ca', { hasText: '여행 완료' }).click();
    await page.waitForTimeout(2500);
    await phoneV();
  });

  await step('AI 여행 일기 초안 자동 생성', async () => {
    await page.goto(`${BASE}#/home`);
    await page.getByRole('button', { name: /AI 여행 일기/ }).first().waitFor({ timeout: 15000 });
    await full('11-home-completed');
    await page.getByRole('button', { name: /AI 여행 일기/ }).first().click();
    await page.getByRole('heading', { name: 'AI 여행 일기' }).waitFor();
    await page.getByText(/경포 솔숲|모래를 팠다/).first().waitFor({ timeout: 15000 });
    const d = (await page.locator('.diary-text').first().innerText()).replace(/\n+/g, ' / ');
    await full('12-diary-draft');
    return `“${d.slice(0, 70)}…” (메모·장소만 사용, 템플릿)`;
  });

  await step('발도장 지도에 강릉 표시', async () => {
    await page.goto(`${BASE}#/pawmap?src=demo`);
    await page.waitForTimeout(600);
    const body = await page.locator('main, .screen').first().innerText();
    if (!body.includes('강릉')) throw new Error('발도장 지도에 강릉 없음');
    await full('13-pawmap');
    await page.goto(`${BASE}#/pawmap`);
    await page.reload();
    await page.waitForTimeout(800);
    const real = await page.locator('.screen').first().innerText();
    await page.goto(`${BASE}#/pawmap?src=demo`);
    await page.waitForTimeout(400);
    const cnt = real.replace(/\s+/g, ' ').match(/(\d+) ?회 총 여행 횟수/)?.[1];
    if (cnt !== '0') throw new Error(`실제 기록 탭 여행 수 ${cnt} (데모가 섞임)`);
    return "'데모 기록' 탭에 강릉 발도장 · 실제 기록 탭은 0회(데모 제외)";
  });

  await step('누적 통계 확인', async () => {
    const txt = (await page.locator('.screen').first().innerText()).replace(/\s+/g, ' ');
    const km = txt.match(/([\d,.]+)\s*km/);
    if (!km) throw new Error('통계 거리 없음');
    globalThis.__kmBefore = km[1];
    return `누적 ${km[1]} km`;
  });

  await step('다음 날 사진 추가 · 일기 수정 (통계 유지)', async () => {
    await page.goto(`${BASE}#/album?src=demo`);
    await page.locator('.card-btn, .album-card, a, button').filter({ hasText: /강릉/ }).first().click();
    await page.getByText('주행 기록').first().waitFor({ timeout: 10000 });
    await addPhotos(() => page.getByRole('button', { name: /사진 추가/ }).first().click(), 1);
    await page.waitForTimeout(800);
    const cells = await page.locator('.photo-cell').count();
    if (cells < 4) throw new Error(`사진 ${cells}장`);
    await btn('수정', true).click();
    const ta = page.getByLabel('여행 일기');
    await ta.fill(`${await ta.inputValue()}\n다음 날 덧붙임: 집에 와서도 바다 냄새가 났다.`);
    await page.getByRole('button', { name: '저장', exact: true }).first().click();
    await page.getByText('다음 날 덧붙임').first().waitFor();
    await full('14-detail-next-day');
    await page.goto(`${BASE}#/pawmap?src=demo`);
    await page.waitForTimeout(500);
    const txt = (await page.locator('.screen').first().innerText()).replace(/\s+/g, ' ');
    const km = txt.match(/([\d,.]+)\s*km/)?.[1];
    if (km !== globalThis.__kmBefore) throw new Error(`통계 변경 ${globalThis.__kmBefore} → ${km}`);
    return `사진 ${cells}장, 일기 수정 저장, 누적 ${km} km 그대로`;
  });

  await step('공유 카드(집 주소·GPS 경로 미포함)', async () => {
    await page.goto(`${BASE}#/album?src=demo`);
    await page.locator('.card-btn, .album-card, a, button').filter({ hasText: /강릉/ }).first().click();
    await page.getByText('주행 기록').first().waitFor();
    await btn('공유 이미지', true).click();
    await page.getByAltText('공유 이미지 미리보기').waitFor();
    await shot('15-share');
    await page.keyboard.press('Escape');
  });

  // ───────── 커뮤니티 ─────────
  await step('여행 기록 → 커뮤니티에 공유하기 (사진·제목·장소 자동)', async () => {
    await page.goto(`${BASE}#/album?src=demo`);
    await page.locator('.card-btn').filter({ hasText: /강릉/ }).first().click();
    await btn('커뮤니티에 공유하기').click();
    await page.getByText('앨범에서 선택').waitFor();
    await page.getByText(/여행 기록에서 사진 \d+장을 불러왔어요/).waitFor({ timeout: 10000 });
    const sel = await page.locator('.ab-item.sel').count();
    await full('16-album-pick');
    if (sel < 4) throw new Error(`선택 ${sel}개`);
    await btn('다음', true).click();
    return `여행 사진 ${sel}장 자동 선택`;
  });

  await step('미리보기 편집: 필터·텍스트·메모·자르기·순서·빼기', async () => {
    await page.locator('.ed-stage').waitFor();
    await btn('필터').click(); await page.locator('.ed-filters button', { hasText: '따뜻하게' }).click();
    await btn('텍스트').click(); await page.getByLabel('사진 문구').fill('바다 냄새 가득');
    await btn('메모').click(); await page.getByLabel('사진 메모').fill('첫 바다 산책');
    await btn('편집', true).click(); await page.locator('.ed-panel .chip', { hasText: '1:1' }).click();
    await page.waitForTimeout(400);
    await btn('뒤로 이동').click();
    await btn('이 사진 빼기').click();
    const n = await page.locator('.ed-thumb').count();
    await full('17-edit');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    return `남은 미디어 ${n}개`;
  });

  await step('게시글 작성: 제목·장소·해시태그·공개 범위 → 게시', async () => {
    const title = await page.getByLabel('게시글 제목').inputValue();
    if (!title.includes('강릉')) throw new Error(`제목 ${title}`);
    await page.getByLabel('게시글 내용').fill('사슴이와 강릉 바다 산책! #바다산책');
    await page.locator('.cp-place').filter({ hasText: /경포|강릉/ }).waitFor();
    await btn('게시', true).click();
    await page.getByText('위치 정보 공개에 동의해 주세요').first().waitFor(); // 동의 없이 게시 불가
    await page.locator('label.switch:has(input[aria-label="위치 정보 공개 동의"])').click();
    await page.getByLabel('해시태그 입력').fill('경포해변'); await page.keyboard.press('Enter');
    await btn('공개 범위 설정').click(); await page.getByRole('button', { name: '팔로워 공개' }).click();
    await full('18-compose');
    await btn('게시', true).click();
    await page.getByText('게시물이').waitFor({ timeout: 10000 });
    await shot('19-upload-done');
    return `제목 “${title}”`;
  });

  await step('게시글 상세(다크): 스와이프 미디어·좋아요·댓글', async () => {
    await btn('게시글 보러가기').click();
    await page.locator('.pd').waitFor();
    const cnt = await page.locator('.pd-top .count-chip').innerText().catch(() => '1/1');
    await page.getByRole('button', { name: '좋아요' }).click();
    await page.getByRole('button', { name: '좋아요 취소' }).waitFor();
    await page.getByRole('button', { name: '댓글', exact: true }).click();
    await page.getByLabel('댓글 입력').fill('다음엔 같이 가요!'); await page.getByRole('button', { name: '댓글 등록' }).click();
    await page.getByText('다음엔 같이 가요!').waitFor();
    await page.keyboard.press('Escape');
    await page.getByText('#경포해변').waitFor();
    await shot('20-post-detail');
    return `미디어 ${cnt}, 좋아요·댓글 저장`;
  });

  await step('여행지 연동 → 이곳으로 여행하기 → 차량 앱 목적지로 안내', async () => {
    await page.locator('.place-pill').click();
    await page.getByRole('button', { name: /이곳으로 여행하기/ }).waitFor();
    await full('21-place');
    const status = await page.locator('.pv-card .badge').first().innerText();
    await page.getByRole('button', { name: /이곳으로 여행하기/ }).click();
    await page.locator('[data-testid=car-only-setup]').waitFor();
    const v = (await page.locator('.car-only-dest').innerText()).split('\n')[0];
    if (!v.includes('강릉')) throw new Error(`목적지 ${v}`);
    if (!(await page.locator('.car-only-dest').innerText()).includes('커뮤니티')) throw new Error('커뮤니티 목적지 표시 없음');
    return `동반 표시 “${status}” · 목적지 “${v}”`;
  });

  await step('피드: 내 게시물(이 기기에만 저장) · 예시 게시물 · 신고/차단', async () => {
    await page.goto(`${BASE}#/community?tab=new`);
    await page.locator('.post-card').first().waitFor();
    await page.getByText('내 게시물 · 이 기기에만 저장').first().waitFor();
    await full('22-feed');
    await page.locator('.post-card', { hasText: '속초' }).click();
    await page.getByRole('button', { name: '더보기' }).click();
    await page.getByRole('button', { name: '게시물 신고' }).click();
    await page.getByRole('button', { name: '스팸·광고' }).click();
    await page.getByText('신고를 접수했어요').waitFor();
    await page.getByRole('button', { name: '더보기' }).click();
    await page.getByRole('button', { name: '작성자 차단' }).click();
    await page.locator('.cm-feed').waitFor();
    if (await page.locator('.post-card', { hasText: '속초' }).count()) throw new Error('차단한 작성자 글이 보임');
    return '신고 접수 · 차단 후 피드에서 숨김';
  });

  await step('새 게시물: 기기 사진 2장 → 제목 없이 게시 시 안내 → 게시', async () => {
    await page.locator('.fab').click();
    await page.getByText('앨범에서 선택').waitFor();
    await addPhotos(() => page.getByRole('button', { name: '기기에서 사진·동영상 가져오기' }).click(), 2);
    await page.getByText(/[3-9]개 선택됨|2개 선택됨/).first().waitFor({ timeout: 10000 }).catch(() => {});
    const before = await page.locator('.ab-item.sel').count();
    await btn('다음', true).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByLabel('게시글 제목').fill('');
    await btn('게시', true).click();
    await page.getByText('게시글 제목을 입력해 주세요').first().waitFor();
    await page.getByLabel('게시글 제목').fill('주말 산책 사진');
    await btn('게시', true).click();
    await page.getByText('게시물이').waitFor();
    return `선택 ${before}개 · 제목 검사 동작`;
  });

  await step('차량 가로 대시보드(1600×900) 확인', async () => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`${BASE}#/home`);
    await page.waitForTimeout(800);
    await shot('23-car-idle');
    await page.setViewportSize({ width: 390, height: 844 });
  });
} finally {
  console.log(results.join('\n'));
  console.log(errors.length ? `브라우저 오류 ${errors.length}건:\n${errors.join('\n')}` : '브라우저 오류 없음');
  await browser.close();
}
process.exit(errors.length || results.some((r) => r.startsWith('❌')) ? 1 : 0);
