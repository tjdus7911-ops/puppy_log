// 데모 시나리오 E2E 점검 (playwright-core + 로컬 Chrome).
// 사용: npm run build && npx vite preview --port 4173 &  →  node e2e/demo-scenario.mjs [chrome 경로]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.argv[2] ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const full = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const click = (text, opts = {}) => page.getByRole('button', { name: text, exact: opts.exact ?? false }).first().click();
const step = (m) => console.log('•', m);

await page.goto(BASE);
await page.getByText('우리 강아지와 떠나는').waitFor();
await shot('01-onboarding-1');
await click('다음'); await click('다음');
await shot('01-onboarding-3');
await click('시작하기');

step('반려견 등록');
await page.getByText('함께 달릴 친구를 소개해 주세요').waitFor();
await click('등록하기');
await page.getByText('이름을 입력해 주세요.').waitFor(); // 유효성 검사
await page.getByPlaceholder('예: 사슴').fill('사슴');
await page.getByPlaceholder('예: 6.5').fill('7.2');
await page.getByRole('radio', { name: '중형견' }).click();
await full('02-pet-form');
await click('등록하기');

step('홈');
await page.getByText('어디로 떠나볼까요?').waitFor();
await full('03-home-empty');

step('여행 시작 (데모 300배속)');
await click('여행 시작하기');
await page.getByText('함께 이동할 반려견').waitFor();
await click('300배속');
await full('04-trip-setup');
await page.getByRole('button', { name: '여행 시작', exact: true }).click();
await page.getByText('다음 휴식까지').waitFor();
await page.waitForTimeout(3000);
await shot('05-live-driving');

step('80분 예고 → 90분 휴식 알림 대기');
await page.getByText('곧 쉬어갈 시간이에요').waitFor({ timeout: 60000 });
await shot('06-reminder-soon');
await click('확인');
await page.getByText('잠깐 쉬어갈까요?').waitFor({ timeout: 60000 });
await shot('07-reminder-due');
await click('주변 휴식 장소 찾기');
await page.getByRole('heading', { name: '주변 휴식 장소' }).waitFor();
await page.waitForTimeout(800);
await shot('08-nearby-rest');
await page.keyboard.press('Escape');

step('휴식 시작/종료');
await page.locator('.action', { hasText: '휴식 시작' }).click();
await page.getByText('휴식 시간').waitFor();
await page.waitForTimeout(2500);
await shot('09-resting');
await page.locator('.action', { hasText: '휴식 종료' }).click();
await page.waitForTimeout(500);

step('새로고침 후 여행 복원');
const before = await page.locator('.big-stat').first().innerText();
await page.reload();
await page.getByText('다음 휴식까지').waitFor({ timeout: 15000 });
const after = await page.locator('.big-stat').first().innerText();
console.log(`  주행 시간 복원: ${before} → ${after}`);

step('목적지 도착까지 대기');
await page.getByText('목적지 근처에 도착했어요').first().waitFor({ timeout: 120000 });
await page.locator('.action', { hasText: '여행 기록' }).click();
await full('10-live-arrived');

step('여행 종료');
await page.locator('.action', { hasText: '여행 종료' }).click();
await page.getByRole('heading', { name: '여행을 마칠까요?' }).waitFor();
await page.locator('.sheet .btn.primary', { hasText: '여행 종료' }).click();
await page.getByText('여행이 저장됐어요').waitFor({ timeout: 15000 });
await page.waitForTimeout(500);
await full('11-trip-detail-new');

step('여행 일기 생성');
await click('여행 일기 만들기');
await page.getByText('기본 템플릿').waitFor({ timeout: 10000 });
const diary = await page.locator('.card .t-body').first().innerText();
console.log('  일기:', diary.replace(/\n+/g, ' / '));

step('공유 이미지');
await click('공유 이미지', { exact: true });
await page.getByAltText('공유 이미지 미리보기').waitFor();
await page.waitForTimeout(500);
await shot('12-share');
await page.keyboard.press('Escape');

step('앨범·발도장·탐색·마이페이지');
await page.goto(`${BASE}#/album`);
await page.getByText('발도장 지도').first().waitFor();
await full('13-album-real-empty');
await page.getByRole('radio', { name: '데모 기록' }).click();
await full('14-album-demo');
await page.goto(`${BASE}#/pawmap`);
await page.getByRole('radio', { name: '데모 기록' }).click();
await page.waitForTimeout(400);
await full('15-pawmap-demo');
await page.goto(`${BASE}#/explore?cat=cafe`);
await page.locator('.card-btn').first().waitFor({ timeout: 10000 });
await click('대형견 동반');
await page.waitForTimeout(300);
await full('16-explore');
await page.locator('.card-btn').first().click();
await page.getByText('반려동물 동반 조건').last().waitFor();
await shot('17-place-detail');
await page.keyboard.press('Escape');
await page.goto(`${BASE}#/home`);
await page.waitForTimeout(400);
await full('18-home-after');
await page.goto(`${BASE}#/my`);
await page.waitForTimeout(400);
await full('19-mypage');

step('위치 권한 거부 → 수동 기록 모드');
await page.locator('label.switch:has(input[aria-label="데모 모드"])').click();
await page.goto(`${BASE}#/trip/setup`);
await page.getByRole('button', { name: '여행 시작', exact: true }).click();
await page.getByText('위치 없이 기록할까요?').waitFor({ timeout: 15000 });
await shot('20-permission-denied');
await click('수동으로 시작');
await page.getByText('수동 기록 모드').first().waitFor();
await shot('21-manual-mode');

step('중복 여행 시작 방지');
await page.goto(`${BASE}#/trip/setup`);
await page.getByRole('button', { name: '여행 시작', exact: true }).click();
await page.getByText('이미 진행 중인 여행이 있어요').waitFor({ timeout: 5000 });

step('가로형(차량 디스플레이) 레이아웃');
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto(`${BASE}#/trip/live`);
await page.waitForTimeout(600);
await shot('22-live-landscape');

console.log(errors.length ? `오류 ${errors.length}건:\n${errors.join('\n')}` : '브라우저 오류 없음');
await browser.close();
process.exit(errors.length ? 1 : 0);
