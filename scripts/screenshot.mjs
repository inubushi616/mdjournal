/**
 * スクリーンショット撮影スクリプト
 * 
 * 使用方法:
 *   node scripts/screenshot.mjs
 * 
 * 事前にサンプルデータでサーバーを起動:
 *   cd server && npm start -- --config ../sample/mdjournal.config.yaml
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3001');

// Reactアプリがロードされるまで待つ
await page.waitForSelector('text=日報ダッシュボード', { timeout: 10000 });
await page.waitForTimeout(2000);

// ドロワーが開いていたら閉じる
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 前の日ボタンを探してクリック（3回: 今日 -> 12/17）
for (let i = 0; i < 3; i++) {
  // ヘッダー内の最初のボタン（左矢印）
  await page.locator('header button').first().click({ force: true });
  await page.waitForTimeout(800);
}
await page.waitForTimeout(1000);

// スクリーンショットを撮影
await page.screenshot({ path: 'docs/screenshot.png' });

await browser.close();
console.log('Screenshot saved to docs/screenshot.png');

