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

// 分组标题上的折叠按钮：收起后组内条目隐藏，再点一次恢复。
test('分组可以折叠收起再展开', async ({ page }) => {
  const narration = hex('3');
  const state: State = { ...emptyState(), voices: [voice(hex('a'), '甲音色', narration), voice(hex('b'), '乙音色')], voiceGroups: [group(narration, '旁白组')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  await page.getByRole('tab', { name: '参考音频' }).click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '旁白组' }) });
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toBeVisible();
  await grouped.getByRole('button', { name: '折叠分组' }).click();
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toBeHidden();
  // 折叠只影响这一个分组，别的区块不受牵连
  await expect(page.getByRole('heading', { name: '乙音色' })).toBeVisible();
  await grouped.getByRole('button', { name: '展开分组' }).click();
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toBeVisible();
});

// 筛选条：点某个分组只看这一组的内容，点「全部」回到分区浏览。
test('分组筛选条可以只看某一个分组', async ({ page }) => {
  const narration = hex('4');
  const state: State = { ...emptyState(), voices: [voice(hex('a'), '甲音色', narration), voice(hex('b'), '乙音色')], voiceGroups: [group(narration, '旁白组')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  await page.getByRole('tab', { name: '参考音频' }).click();
  await expect(page.getByRole('heading', { name: '甲音色' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '乙音色' })).toBeVisible();
  // 只看「旁白组」：组外的乙音色消失，且不再分区（只剩这一组）
  await page.locator('.group-filter').getByRole('button', { name: /^旁白组/ }).click();
  await expect(page.getByRole('heading', { name: '甲音色' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '乙音色' })).toHaveCount(0);
  // 切到「未分组」：反过来只剩乙音色
  await page.locator('.group-filter').getByRole('button', { name: /^未分组/ }).click();
  await expect(page.getByRole('heading', { name: '乙音色' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '甲音色' })).toHaveCount(0);
  // 回到「全部」：两个都在
  await page.locator('.group-filter').getByRole('button', { name: /^全部/ }).click();
  await expect(page.getByRole('heading', { name: '甲音色' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '乙音色' })).toBeVisible();
});

// 拖拽：把条目拖到分组名上即可归类。
test('可以把条目拖到分组上完成归类', async ({ page }) => {
  const narration = hex('5');
  const state: State = { ...emptyState(), voices: [voice(hex('a'), '甲音色', narration), voice(hex('b'), '乙音色')], voiceGroups: [group(narration, '旁白组')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  await page.getByRole('tab', { name: '参考音频' }).click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '旁白组' }) });
  const loose = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '未分组' }) });
  await expect(loose.getByRole('heading', { name: '乙音色' })).toBeVisible();
  await page.locator('.library-entry').filter({ has: page.getByRole('heading', { name: '乙音色' }) })
    .dragTo(page.locator('.group-filter').getByRole('button', { name: /^旁白组/ }));
  await expect(grouped.getByRole('heading', { name: '乙音色' })).toBeVisible();
  await expect(loose.getByRole('heading', { name: '乙音色' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voice-workbench-v1') ?? '{}').voices?.find((v: { name: string }) => v.name === '乙音色')?.groupId ?? null))
    .toBe(narration);
});
