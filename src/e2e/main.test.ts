// E2Eテスト雛形（Playwright）
import { test, expect } from '@playwright/test';

test('main page loads', async ({ page }) => {
  await page.goto('/');
  expect(await page.title()).toBeDefined();
});

