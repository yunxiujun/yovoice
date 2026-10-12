import { test, expect } from '@playwright/test';
import { seedState } from './seed';
import { emptyState, synthesisSettings, type State } from '../src/shared/workbench';

const hex = (char: string) => char.repeat(32);
const voice = (id: string, name: string, groupId?: string) => ({ id, name, fileName: `${id}.wav`, duration: 12, groupId });
const group = (id: string, name: string) => ({ id, name, createdAt: '2026-01-01T00:00:00Z' });

// 参考音色：条目按分组落在各自区块，通过菜单可以直接改归属。
test('参考音色按分组区块展示，并能把条目移动到分组', async ({ page }) => {
  const narration = hex('1');
  const state: State = { ...emptyState(), voices: [voice(hex('a'), '甲音色', narration), voice(hex('b'), '乙音色')], voiceGroups: [group(narration, '旁白组')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  await page.getByRole('tab', { name: '参考音频' }).click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '旁白组' }) });
  const loose = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '未分组' }) });
  // 各自落在正确的区块里
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toBeVisible();
  await expect(loose.getByRole('heading', { name: '乙音色' })).toBeVisible();
  // 移动后易位，且原区块不再保留它
  await loose.getByRole('button', { name: '移动到分组' }).click();
  await page.getByRole('menuitem', { name: '旁白组' }).click();
  await expect(grouped.getByRole('heading', { name: '乙音色' })).toBeVisible();
  await expect(loose.getByRole('heading', { name: '乙音色' })).toHaveCount(0);
});

// 角色库复用同一套分组组件；删除分组只让成员回到未分组，角色本身保留。
test('角色库支持分组，删除分组后角色回到未分组', async ({ page }) => {
  const lead = hex('2');
  const settings = synthesisSettings(emptyState().drafts[0]);
  const state: State = {
    ...emptyState(),
    characters: [{ id: hex('c'), name: '角色甲', settings, demoText: '试听台词', groupId: lead }],
    characterGroups: [group(lead, '主角组')],
  };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '主角组' }) });
  await expect(grouped.getByRole('heading', { name: '角色甲' })).toBeVisible();
  await grouped.getByRole('button', { name: '分组操作' }).click();
  await page.getByRole('menuitem', { name: '删除分组' }).click();
  await page.getByRole('button', { name: '删除分组', exact: true }).click();
  // 这是最后一个分组，删掉后界面回到平铺列表；角色本身必须保留，只是不再有归属
  await expect(page.getByRole('heading', { name: '主角组' })).toHaveCount(0);
  await expect(page.locator('.group-section')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '角色甲' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voice-workbench-v1') ?? '{}').characters?.[0]?.groupId ?? null)).toBeNull();
});
