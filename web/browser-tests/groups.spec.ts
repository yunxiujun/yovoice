import { test, expect, type Locator, type Page } from '@playwright/test';
import { seedState } from './seed';
import { emptyState, synthesisSettings, type Draft, type State } from '../src/shared/workbench';

const hex = (char: string) => char.repeat(32);
const voice = (id: string, name: string, groupId?: string) => ({ id, name, fileName: `${id}.wav`, duration: 12, groupId });
const group = (id: string, name: string) => ({ id, name, createdAt: '2026-01-01T00:00:00Z' });
// 作品列表里的卡片用标题按钮区分；侧栏的「最近作品」也有同名按钮，所以断言一律限定在卡片内。
const project = (id: string, title: string, kind: 'text' | 'story' | 'music' | 'score', groupId?: string): Draft => ({
  ...emptyState().drafts[0], id, title, kind, groupId, text: `${title}的正文`,
  createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z',
});
const card = (scope: Locator, title: string) => scope.locator('.library-entry').filter({ has: scope.page().getByRole('button', { name: title, exact: true }) });

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

// 拖拽用手写指针事件实现，必须用真实鼠标序列来测：
// Playwright 的 dragTo 走 CDP 的拖拽拦截，根本不派发 pointer 事件，测不到这条路径。
async function dragOnto(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('取不到拖拽坐标');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // 先挪过阈值（5px）让拖拽真正开始，再走到落点
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

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
  await dragOnto(page,
    page.locator('.library-entry').filter({ has: page.getByRole('heading', { name: '乙音色' }) }),
    page.locator('.group-filter').getByRole('button', { name: /^旁白组/ }));
  await expect(grouped.getByRole('heading', { name: '乙音色' })).toBeVisible();
  await expect(loose.getByRole('heading', { name: '乙音色' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voice-workbench-v1') ?? '{}').voices?.find((v: { name: string }) => v.name === '乙音色')?.groupId ?? null))
    .toBe(narration);
});

// 拖到分组标题上同样能归类，而且拖回原来所在的组不会白跑一趟。
test('可以拖到分组标题上归类，拖回原组不做改动', async ({ page }) => {
  const narration = hex('6');
  const state: State = { ...emptyState(), voices: [voice(hex('a'), '甲音色', narration), voice(hex('b'), '乙音色')], voiceGroups: [group(narration, '旁白组')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  await page.getByRole('tab', { name: '参考音频' }).click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '旁白组' }) });
  const loose = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '未分组' }) });
  // 拖到「未分组」区块的标题上 → 从旁白组退回未分组
  await dragOnto(page,
    page.locator('.library-entry').filter({ has: page.getByRole('heading', { name: '甲音色' }) }),
    loose.getByRole('heading', { name: '未分组' }));
  await expect(loose.getByRole('heading', { name: '甲音色' })).toBeVisible();
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toHaveCount(0);
  // 再拖回旁白组标题
  await dragOnto(page,
    page.locator('.library-entry').filter({ has: page.getByRole('heading', { name: '甲音色' }) }),
    grouped.getByRole('heading', { name: '旁白组' }));
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toBeVisible();
});

// 没有移动就松手是普通点击，不能被拖拽逻辑吃掉。
test('按住不动松手仍然是点击，不会误触拖拽', async ({ page }) => {
  const narration = hex('7');
  const state: State = { ...emptyState(), voices: [voice(hex('a'), '甲音色', narration), voice(hex('b'), '乙音色')], voiceGroups: [group(narration, '旁白组')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-characters').click();
  await page.getByRole('tab', { name: '参考音频' }).click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '旁白组' }) });
  const card = page.locator('.library-entry').filter({ has: page.getByRole('heading', { name: '甲音色' }) });
  const box = await card.boundingBox();
  if (!box) throw new Error('取不到卡片坐标');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2, { steps: 2 }); // 未过阈值
  await page.mouse.up();
  await page.waitForTimeout(200);
  // 位置没变，说明没被当成拖拽
  await expect(grouped.getByRole('heading', { name: '甲音色' })).toBeVisible();
  expect(await page.locator('body.group-dragging').count()).toBe(0);
});

// 读回浏览器里真正落盘的状态：分组归属必须写在作品上，而不只是界面上挪了个位置。
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('voice-workbench-v1') ?? '{}') as { drafts?: { title: string; groupId?: string }[]; draftGroups?: { id: string }[] });

// 作品列表（故事配音 / 语音生成 / 音乐生成 / 编曲）与素材库共用同一套分组组件。
// 一个分组都没有的时候也必须看得见入口 —— 之前这里连「新建分组」都没有。
test('作品列表可以新建分组，并把作品移进分组', async ({ page }) => {
  const state: State = { ...emptyState(), drafts: [project(hex('c1'), '作品甲', 'story'), project(hex('c2'), '作品乙', 'story')] };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-story').click();
  await expect(page.getByRole('button', { name: '新建分组' })).toBeVisible();
  await page.getByRole('button', { name: '新建分组' }).click();
  await page.getByRole('textbox', { name: '分组名称' }).fill('第一幕');
  await page.getByRole('button', { name: '保存' }).click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '第一幕' }) });
  const loose = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '未分组' }) });
  // 新建的分组是空组，两条作品都还在未分组里
  await expect(grouped).toBeVisible();
  await expect(grouped.getByText('这个分组还没有内容')).toBeVisible();
  await expect(card(loose, '作品甲')).toBeVisible();
  await card(loose, '作品甲').getByRole('button', { name: '移动到分组' }).click();
  await page.getByRole('menuitem', { name: '第一幕' }).click();
  await expect(card(grouped, '作品甲')).toBeVisible();
  await expect(card(loose, '作品甲')).toHaveCount(0);
  const after = await saved(page);
  expect(after.drafts?.find(d => d.title === '作品甲')?.groupId).toBe(after.draftGroups?.[0]?.id);
});

// 分组归属按作品类型隔离：歌曲落在同一分组里，也不该出现在故事配音的页面上。
test('作品列表的分组筛选与折叠只覆盖当前类型', async ({ page }) => {
  const act = hex('c3');
  const state: State = {
    ...emptyState(),
    drafts: [project(hex('c1'), '故事甲', 'story', act), project(hex('c2'), '故事乙', 'story'), project(hex('c9'), '歌曲甲', 'music', act)],
    draftGroups: [group(act, '第一幕')],
  };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-story').click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '第一幕' }) });
  const loose = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '未分组' }) });
  await expect(card(grouped, '故事甲')).toBeVisible();
  // 故事页只列故事：同组的歌曲不在这一页
  await expect(grouped.getByRole('button', { name: '歌曲甲' })).toHaveCount(0);
  await expect(card(loose, '故事乙')).toBeVisible();
  // 折叠：组内作品隐藏，未分组不受影响
  await grouped.getByRole('button', { name: '折叠分组' }).click();
  await expect(card(grouped, '故事甲')).toBeHidden();
  await expect(card(loose, '故事乙')).toBeVisible();
  await grouped.getByRole('button', { name: '展开分组' }).click();
  // 筛选：只看「第一幕」时未分组的故事消失（此时不再分区，是一条平铺列表）
  await page.locator('.group-filter').getByRole('button', { name: /^第一幕/ }).click();
  const listed = page.locator('.library-content');
  await expect(card(listed, '故事甲')).toBeVisible();
  await expect(card(listed, '故事乙')).toHaveCount(0);
});

// 给作品分好组之后，编辑器里那份副本并不知道新归属。
// 它一旦被保存回去，整个归属就被冲掉了 —— 打开刚分好组的作品正是这条路径。
test('给作品分好组后，再保存作品不会把归属冲掉', async ({ page }) => {
  const act = hex('c4');
  const state: State = {
    ...emptyState(),
    drafts: [project(hex('c1'), '故事甲', 'story'), project(hex('c2'), '故事乙', 'story')],
    draftGroups: [group(act, '第一幕')],
  };
  await seedState(page, state);
  await page.goto('/');
  await page.getByTestId('nav-story').click();
  const grouped = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '第一幕' }) });
  const loose = page.locator('.group-section').filter({ has: page.getByRole('heading', { name: '未分组' }) });
  // 故事甲就是当前打开的那一份，编辑器里的副本还没有分组信息。
  // 卡片正中央落的是标题按钮，按钮会在冒泡阶段吃掉 pointerdown —— 用户最顺手抓的就是这里，
  // 所以这条用例顺便守住「按标题也能拖起来」。
  await dragOnto(page, card(loose, '故事甲'), grouped.getByRole('heading', { name: '第一幕' }));
  await expect(card(grouped, '故事甲')).toBeVisible();
  // 拖动结束后补上来的那次 click 必须被吃掉，不能顺手把作品打开
  // （编辑器的 DOM 一直挂着，只是被藏起来，所以要比可见性）
  await expect(page.locator('.document-title')).toBeHidden();
  expect((await saved(page)).drafts?.find(d => d.title === '故事甲')?.groupId).toBe(act);
  // 打开它：这一步会先用编辑器里的副本保存一次
  await card(grouped, '故事甲').getByRole('button', { name: '故事甲', exact: true }).click();
  await expect(page.locator('.document-title')).toBeVisible();
  await page.waitForTimeout(400);
  expect((await saved(page)).drafts?.find(d => d.title === '故事甲')?.groupId).toBe(act);
  // 回来之后它还在分组里，没有被打回未分组
  await page.getByTestId('nav-story').click();
  await expect(card(grouped, '故事甲')).toBeVisible();
});
