import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = 'http://127.0.0.1:5173/';
const testAddress = '0xA71C0000000000000000000000000000000090EF';

await fs.mkdir('qa', { recursive: true });
const css = await fs.readFile('src/styles.css', 'utf-8');
const bannedCss = ['backdrop-filter', 'filter: blur'];
for (const token of bannedCss) {
  if (css.includes(token)) {
    throw new Error(`Banned CSS token found: ${token}`);
  }
}
const radii = [...css.matchAll(/border-radius:\s*(\d+)px/g)].map((match) => Number(match[1]));
const tooLargeRadius = radii.find((radius) => radius > 12 && radius !== 999);
if (tooLargeRadius) {
  throw new Error(`Border radius exceeds reference limit: ${tooLargeRadius}px`);
}
const requiredTokens = [
  '--bg: #0f1012',
  '--panel: #1a1b20',
  '--blue: #6867f5',
  '--green: #10b981',
  '.dashboard',
  '.assignment-banner',
  '.submitted-card',
  '.analysis-card',
  '.winner-banner',
  '.score-card',
  'data-testid="connect-wallet"',
  'data-testid="argument-input"',
  'data-testid="submit-argument"',
  'data-testid="call-verdict"',
];
const source = await fs.readFile('src/main.tsx', 'utf-8');
for (const token of requiredTokens) {
  const haystack = token.startsWith('data-testid') ? source : css;
  if (!haystack.includes(token)) {
    throw new Error(`Required UI token missing: ${token}`);
  }
}
if (css.includes('translateY(') || css.includes('scale(')) {
  throw new Error('Disallowed transform animation token found');
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox'],
});

async function checkViewport(name, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.brand', { timeout: 5000 });
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyText: document.body.innerText,
  }));
  await page.screenshot({ path: `qa/${name}.png`, fullPage: false });
  if (metrics.scrollWidth > metrics.clientWidth) {
    throw new Error(`${name} has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
  }
  if (!metrics.bodyText.includes('THE VERDICT')) {
    throw new Error(`${name} did not render THE VERDICT`);
  }
  if (metrics.bodyText.includes('0xA71C')) {
    throw new Error(`${name} exposed a hardcoded wallet before connection`);
  }
  await page.close();
}

await checkViewport('arena-desktop-smoke', 1440, 1000);
await checkViewport('arena-mobile-smoke', 390, 844);

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument((address) => {
  window.ethereum = {
    request: async ({ method }) => {
      if (method === 'eth_requestAccounts') return [address];
      return null;
    },
  };
}, testAddress);
await page.goto(baseUrl, { waitUntil: 'networkidle0' });
await page.click('[data-testid="connect-wallet"]');
await page.waitForSelector('[data-testid="argument-input"]', { timeout: 5000 });
await page.type(
  '[data-testid="argument-input"]',
  'Bitcoin will remain the monetary benchmark because its social consensus is simpler, its supply story is clearer, and institutions buy it as neutral reserve collateral rather than application infrastructure.',
);
await page.click('[data-testid="submit-argument"]');
await page.waitForSelector('.submitted-card', { timeout: 5000 });
await page.click('[data-testid="call-verdict"]');
await page.waitForSelector('.winner-banner', { timeout: 5000 });
await page.screenshot({ path: 'qa/verdict-desktop-smoke.png', fullPage: false });
const verdictText = await page.$eval('.winner-banner', (node) => node.textContent || '');
if (!verdictText.includes('Winner') || !verdictText.includes('VerdictX')) {
  throw new Error('Winner banner did not include the completed verdict');
}
await browser.close();
