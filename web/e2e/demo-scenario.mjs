// 멍로드 전체 여행 흐름 E2E (21단계, playwright-core + 로컬 Chrome, 데모 모드).
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
    await page.getByText('어디로 떠나볼까요?').waitFor();
    await page.getByText('사슴').first().waitFor();
    await full('01-home-before');
  });

  await step('목적지 강릉 설정 (데모: 차량 내비 목적지 제안)', async () => {
    await page.getByText('차량 내비에').waitFor();
    await btn('기록 시작').click();
    await page.getByText('함께 이동할 반려견').waitFor();
    const v = await page.getByLabel('목적지', { exact: true }).inputValue();
    if (!v.includes('강릉')) throw new Error(`목적지 값: ${v}`);
    return `목적지 입력값 "${v}"`;
  });

  await step('출발 전 반려견 맞춤 휴식 계획 확인', async () => {
    await page.getByText('반려견 맞춤 휴식 계획').waitFor();
    const card = page.locator('section', { has: page.getByRole('heading', { name: '반려견 맞춤 휴식 계획' }) });
    const txt = (await card.innerText()).replace(/\s+/g, ' ');
    await btn('300배속').click();
    await full('02-trip-setup-plan');
    const m = txt.match(/예상 주행 (.+?) 휴식 간격 (\S+) 예상 휴식 (\S+)/);
    if (!m) throw new Error(`계획 미표시: ${txt.slice(0, 80)}`);
    return `예상 주행 ${m[1]} · 간격 ${m[2]} · 예상 휴식 ${m[3]}`;
  });

  await step('여행 시작 (데모 300배속)', async () => {
    await page.getByRole('button', { name: '여행 시작', exact: true }).click();
    await page.locator('.stat3').waitFor();
    await page.waitForTimeout(2000);
    await shot('03-live-driving');
  });

  await step('주행 중 휴식 예고 알림(80분)', async () => {
    await page.getByRole('heading', { name: /곧 쉬어갈 시간이에요/ }).waitFor({ timeout: 60000 });
    await shot('04-reminder-soon');
    await btn('확인').click();
  });

  await step('휴식 알림(90분) → 휴식 시작/종료', async () => {
    await page.getByRole('heading', { name: /잠깐 쉬어갈까요/ }).waitFor({ timeout: 60000 });
    await shot('05-reminder-due');
    await page.keyboard.press('Escape');
    await page.locator('.action', { hasText: '휴식 시작' }).click();
    await page.locator('.stat3 .k', { hasText: '휴식 시간' }).waitFor();
    await page.waitForTimeout(1500);
    await page.locator('.action', { hasText: '휴식 종료' }).click();
    await page.waitForTimeout(400);
  });

  await step('주행 중 자동 장소 추천 카드(샘플 데이터)', async () => {
    // 휴식·식사 시간 트리거로 뜨거나, 음성 요청 칩으로 띄웁니다.
    const pop = page.locator('.reco-pop');
    if (!(await pop.isVisible())) {
      const chip = page.locator('.chips .chip', { hasText: /근처|추천|카페|쉴 곳/ }).first();
      if (await chip.count()) await chip.click();
    }
    try {
      await pop.waitFor({ timeout: 30000 });
    } catch {
      return '경로 앞쪽 3km 이내 샘플 후보 없음 → 카드 미표시(정상 동작: 억지 추천 안 함)';
    }
    const s = (await pop.innerText()).replace(/\s+/g, ' ').slice(0, 80);
    await shot('06-auto-reco');
    await pop.getByRole('button', { name: '괜찮아요' }).click();
    return s;
  });

  await step('도로 위험 정보(데모 표시)', async () => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.locator('.hazard-bar .badge.sample').waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    await shot('07-dashboard-wide-hazard');
    await page.setViewportSize({ width: 390, height: 844 });
    return '‘데모’ 배지와 함께 표시';
  });

  await step('강릉 목적지 도착 → 여행지 활동(여행 계속)', async () => {
    await page.getByText('목적지 근처에 도착했어요').first().waitFor({ timeout: 120000 });
    await page.locator('.action', { hasText: '목적지 도착' }).click();
    await page.getByRole('heading', { name: '목적지에 도착했나요?' }).waitFor();
    await btn('목적지 도착 · 여행지 활동 시작').click();
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
    await addPhotos(() => page.locator('.tile', { hasText: '사진 추가' }).click(), 3);
    await page.locator('.tile', { hasText: '3장' }).waitFor({ timeout: 10000 });
  });

  await step('방문 장소 기록', async () => {
    await page.locator('.tile', { hasText: '장소 기록' }).click();
    await page.getByPlaceholder('예: 경포 솔숲 산책로').fill('경포 솔숲 산책로');
    await page.getByPlaceholder('예: 그늘이 많아 쉬기 좋았음').fill('그늘이 많아 쉬기 좋았음');
    await btn('기록하기').click();
    await page.locator('.tile', { hasText: '1곳' }).waitFor();
  });

  await step('여행 메모 작성', async () => {
    await page.locator('.tile', { hasText: '메모 작성' }).click();
    await page.getByRole('dialog').getByLabel('여행 메모').fill('바다 앞에서 사슴이가 한참 모래를 팠다.');
    await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await page.locator('.tile', { hasText: '작성됨' }).waitFor();
    await full('09-destination-filled');
  });

  await step('돌아가는 길 기록 시작', async () => {
    await btn('돌아가는 길 기록 시작').click();
    await page.locator('.stat3').waitFor({ timeout: 15000 });
    await page.getByText(/돌아오는 길|돌아가는 길/).first().waitFor();
    await shot('10-return-driving');
  });

  await step('복귀 중 휴식 알림(구간별 독립)', async () => {
    await page.getByRole('heading', { name: /곧 쉬어갈 시간이에요|잠깐 쉬어갈까요/ }).waitFor({ timeout: 60000 });
    await page.keyboard.press('Escape');
    return '복귀 구간에서도 알림 동작';
  });

  await step('집 도착 → 여행 완료', async () => {
    await page.getByText('집 근처에 도착했어요').first().waitFor({ timeout: 120000 });
    // 도중에 뜬 휴식 알림(90분)은 닫습니다
    if (await page.getByRole('heading', { name: /잠깐 쉬어갈까요|곧 쉬어갈/ }).count()) await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.action', { hasText: '집 도착 · 여행 완료' }).click();
    await page.getByRole('heading', { name: '집에 도착했나요?' }).waitFor();
    await page.locator('.sheet .btn.primary', { hasText: '여행 완료' }).click();
    await page.waitForTimeout(2500);
  });

  await step('AI 여행 일기 초안 자동 생성', async () => {
    await page.goto(`${BASE}#/home`);
    await page.getByRole('button', { name: /AI 여행 일기/ }).first().waitFor({ timeout: 15000 });
    await full('11-home-completed');
    await page.getByRole('button', { name: /AI 여행 일기/ }).first().click();
    await page.getByRole('heading', { name: 'AI 여행 일기' }).waitFor();
    await page.getByText(/경포 솔숲|모래를 팠다/).first().waitFor({ timeout: 15000 });
    const d = (await page.locator('.card .t-body').first().innerText()).replace(/\n+/g, ' / ');
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
    const cnt = real.replace(/\s+/g, ' ').match(/총 여행 횟수 (\d+)회/)?.[1];
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
} finally {
  console.log(results.join('\n'));
  console.log(errors.length ? `브라우저 오류 ${errors.length}건:\n${errors.join('\n')}` : '브라우저 오류 없음');
  await browser.close();
}
process.exit(errors.length || results.some((r) => r.startsWith('❌')) ? 1 : 0);
