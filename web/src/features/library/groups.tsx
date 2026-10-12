import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useTranslator } from '@astryxdesign/core/i18n';
import { Check, ChevronDown, ChevronRight, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { AppDialog, ConfirmDelete } from '../../shared/ui/app-dialog';
import { call } from '../../shared/lib/client';
import { formatCallError } from '../../shared/i18n/format';
import { overflowTitle } from '../../shared/ui/overflow-title';
import type { Group } from '../../shared/workbench';

/** 分组的三个作用域：参考音色、角色、作品各自独立，与 Go 的 workbench.Scope* 对应。 */
export type GroupScope = 'voice' | 'character' | 'draft';

/** 分组名长度上限，与 Go 的 workbench.GroupNameLimit 一致。 */
export const GROUP_NAME_LIMIT = 60;

/** 「未分组」在筛选与折叠里需要一个稳定的键，服务端的分组 ID 不会与它相撞。 */
export const UNGROUPED_KEY = '@ungrouped';

/** 指针移动超过这个距离才算拖拽，免得把普通的点击误判成拖动。 */
const DRAG_THRESHOLD = 5;

export const saveGroup = (scope: GroupScope, id: string, name: string) => call<Group>('group.save', { scope, id, name });
export const deleteGroup = (scope: GroupScope, id: string) => call('group.delete', { scope, id });
export const assignGroup = (scope: GroupScope, groupId: string, ids: string[]) => call('group.assign', { scope, groupId, ids });

/**
 * 挂在可拖动的条目上。拖拽用指针事件手写，**不用 HTML5 DnD**：
 * 桌面 App 跑在 WebView2 里，而 HTML5 拖拽的启动依赖操作系统级的拖拽会话，
 * 在嵌入式宿主和触控板上都可能不触发 —— 实测用户根本拖不动。
 * 指针事件则和点击走同一条路径，只要点得动就一定拖得动。
 *
 * 监听的是**捕获阶段**：卡片上的标题、菜单都是按钮，按钮自己会在冒泡阶段
 * 截住 pointerdown，挂在根节点的冒泡处理器就永远收不到 —— 而标题正是用户
 * 最顺手去抓的地方。捕获阶段先于按钮自己的处理器执行，抓哪儿都能拖起来。
 */
export type GroupDragSource = {
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  'data-draggable'?: 'true';
  'data-dragging'?: 'true';
};

/** 挂在分组标题、筛选按钮这类落点上。data-group-drop 为空串表示「未分组」。 */
export type GroupDropTarget = {
  'data-group-drop': string;
  'data-drop-active'?: 'true';
};

/** 找出指针当前位置下的分组落点；返回 null 表示没落在任何落点上。 */
function dropTargetAt(x: number, y: number) {
  const hit = document.elementFromPoint(x, y)?.closest('[data-group-drop]');
  return hit ? hit.getAttribute('data-group-drop') : null;
}

/** 新建或重命名分组的对话框。existing 用于拦截重名，调用方应排除当前正在改名的分组。 */
export function GroupDialog({ title, initial = '', existing, busy, error, onClose, onSubmit }: {
  title: string; initial?: string; existing: string[]; busy?: boolean; error?: string;
  onClose: () => void; onSubmit: (name: string) => void;
}) {
  const t = useTranslator();
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && existing.some(value => value.toLowerCase() === trimmed.toLowerCase());
  return <AppDialog title={title} busy={busy} error={error} onClose={onClose} actions={<>
    <Button label={t('@yovoice.action.cancel')} isDisabled={busy} onClick={onClose} />
    <Button label={t('@yovoice.action.save')} variant="primary" isLoading={busy}
      isDisabled={!trimmed || duplicate || trimmed.length > GROUP_NAME_LIMIT} onClick={() => onSubmit(trimmed)} />
  </>}>
    <TextInput label={t('@yovoice.group.name')} hasAutoFocus value={name} onChange={value => setName(value.slice(0, GROUP_NAME_LIMIT))} />
    {duplicate ? <small role="alert" className="dialog-error">{t('@yovoice.group.duplicate')}</small> : null}
  </AppDialog>;
}

/** 把条目移动到分组的菜单：列出全部已有分组，当前所在项用对勾标出。 */
export function GroupMoveMenu({ groups, current, disabled, onMove }: {
  groups: Group[]; current?: string; disabled?: boolean; onMove: (groupId: string) => void;
}) {
  const t = useTranslator();
  return <DropdownMenu className="group-move-menu" alignment="end" hasChevron={false}
    button={{ size: 'sm', variant: 'ghost', isIconOnly: true, icon: <FolderInput size={15} />, label: t('@yovoice.group.move'), isDisabled: disabled }}
    items={[
      { label: t('@yovoice.group.ungrouped'), icon: !current ? <Check size={15} /> : undefined, onClick: () => onMove('') },
      ...groups.map(group => ({ label: group.name, icon: group.id === current ? <Check size={15} /> : undefined, onClick: () => onMove(group.id) })),
    ]} />;
}

/**
 * 分组区块的标题栏：折叠开关、组名、成员数和右侧操作。
 * detached 标记「未分组」这一虚拟区块；drop 让标题本身成为拖拽落点。
 */
export function GroupHeading({ name, count, actions, detached, collapsed, onToggle, drop }: {
  name: string; count: number; actions?: ReactNode; detached?: boolean;
  collapsed?: boolean; onToggle?: () => void; drop?: GroupDropTarget;
}) {
  const t = useTranslator();
  return <HStack className="group-heading" gap={2} vAlign="center" hAlign="between" data-detached={!!detached} {...drop}>
    <HStack className="group-heading-label" gap={1} vAlign="center">
      {onToggle ? <Button size="sm" variant="ghost" isIconOnly icon={collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        label={t(collapsed ? '@yovoice.group.expand' : '@yovoice.group.collapse')} onClick={onToggle} /> : null}
      <h2 onPointerEnter={overflowTitle}>{name}</h2>
      <small className="group-count">{t('@yovoice.group.count', { count })}</small>
    </HStack>
    {actions}
  </HStack>;
}

/**
 * 分组筛选条：点某个分组只看这一组的内容，点「全部」回到分区浏览。
 * 有分组时它就是拖拽的第一个落点，把条目拖到某个分组名上即可移动。
 */
export function GroupFilter({ groups, value, counts, ungrouped, onChange, drop }: {
  groups: Group[]; value: string | null; counts: Record<string, number>; ungrouped: number;
  onChange: (value: string | null) => void; drop: (groupId: string) => GroupDropTarget;
}) {
  const t = useTranslator();
  const total = ungrouped + groups.reduce((sum, group) => sum + (counts[group.id] ?? 0), 0);
  return <HStack className="group-filter" gap={2} vAlign="center" wrap="wrap" role="group" aria-label={t('@yovoice.group.filter')}>
    <Button size="sm" className="group-chip" variant={value === null ? 'primary' : 'secondary'}
      label={`${t('@yovoice.group.all')} ${total}`} onClick={() => onChange(null)} />
    {groups.map(group => <Button key={group.id} size="sm" className="group-chip" variant={value === group.id ? 'primary' : 'secondary'}
      label={`${group.name} ${counts[group.id] ?? 0}`} onClick={() => onChange(group.id)} {...drop(group.id)} />)}
    <Button size="sm" className="group-chip" variant={value === '' ? 'primary' : 'secondary'}
      label={`${t('@yovoice.group.ungrouped')} ${ungrouped}`} onClick={() => onChange('')} {...drop('')} />
  </HStack>;
}

/** 分组区块内没有成员时的占位提示。 */
export function GroupEmpty({ text }: { text: string }) {
  return <p className="group-empty-hint" role="status">{text}</p>;
}

/** 分组标题栏右侧的重命名与删除菜单。 */
export function GroupActions({ onRename, onDelete, disabled }: { onRename: () => void; onDelete: () => void; disabled?: boolean }) {
  const t = useTranslator();
  return <DropdownMenu className="group-actions-menu" alignment="end" hasChevron={false}
    button={{ size: 'sm', variant: 'ghost', isIconOnly: true, icon: <MoreHorizontal size={16} />, label: t('@yovoice.group.more'), isDisabled: disabled }}
    items={[
      { label: t('@yovoice.group.rename'), icon: <Pencil size={16} strokeWidth={1.5} />, onClick: onRename },
      { label: t('@yovoice.group.delete'), icon: <Trash2 size={16} strokeWidth={1.5} />, variant: 'destructive', onClick: onDelete },
    ]} />;
}

/** 删除分组的确认框：说明成员只会回到未分组，不会被删除。 */
export function GroupDeleteDialog({ name, busy, error, onClose, onConfirm }: {
  name: string; busy?: boolean; error?: string; onClose: () => void; onConfirm: () => void;
}) {
  const t = useTranslator();
  return <ConfirmDelete title={t('@yovoice.group.delete')} description={`${name} — ${t('@yovoice.group.deleteConfirm')}`}
    confirmLabel={t('@yovoice.group.delete')} busy={busy ?? false} error={error} onClose={onClose} onConfirm={onConfirm} />;
}

/**
 * 按分组归拢条目：先按分组顺序列出，最后追加「未分组」。
 * 搜索时隐藏没有命中的分组，避免满屏空标题；不搜索时保留空分组，方便往里放东西。
 */
export function sectionize<T>(items: T[], groups: Group[], groupId: (item: T) => string | undefined, searching: boolean) {
  const known = new Set(groups.map(group => group.id));
  const sections: { group: Group | null; items: T[] }[] = groups.map(group => ({ group, items: items.filter(item => groupId(item) === group.id) }));
  sections.push({ group: null, items: items.filter(item => { const id = groupId(item); return !id || !known.has(id); }) });
  return searching ? sections.filter(section => section.items.length > 0) : sections;
}

/** 统计每个分组（以及未分组）的条目数，供筛选条的角标使用。 */
export function countByGroup<T>(items: T[], groups: Group[], groupId: (item: T) => string | undefined) {
  const known = new Set(groups.map(group => group.id));
  const counts: Record<string, number> = {};
  let ungrouped = 0;
  for (const item of items) {
    const id = groupId(item);
    if (id && known.has(id)) counts[id] = (counts[id] ?? 0) + 1;
    else ungrouped += 1;
  }
  return { counts, ungrouped };
}

/** 判断条目是否落在当前筛选里：null 表示全部，空串表示未分组。 */
export function matchesGroup<T>(item: T, groups: Group[], groupId: (item: T) => string | undefined, filter: string | null) {
  if (filter === null) return true;
  const id = groupId(item);
  if (filter === '') return !id || !groups.some(group => group.id === id);
  return id === filter;
}

/**
 * 折叠状态按作用域分别记住，刷新界面或切换页面后仍然保持。
 * 读出内容一律做形状校验，避免旧版本残留的脏数据把界面搞坏。
 */
export function useGroupCollapse(scope: GroupScope) {
  const storageKey = `yovoice.group.collapsed.${scope}`;
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch { return []; }
  });
  function toggle(key: string) {
    const next = collapsed.includes(key) ? collapsed.filter(value => value !== key) : [...collapsed, key];
    setCollapsed(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* 隐私模式下写不进去，只是不记忆 */ }
  }
  return { collapsed, toggle };
}

/**
 * 分组的新建、重命名、删除、移动与拖拽。两个列表页共用同一套状态机，保证交互一致。
 * 返回的 dialogs 是受控弹窗节点，由调用方渲染在页面中。
 */
export function useGroupEditing(scope: GroupScope, groups: Group[], onError: (message: string) => void) {
  const t = useTranslator();
  const [dialog, setDialog] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function move(ids: string[], groupId: string) {
    void assignGroup(scope, groupId, ids).catch(e => onError(formatCallError(t, e)));
  }
  async function submit(name: string) {
    if (!dialog || busy) return;
    setBusy(true); setError('');
    try {
      await saveGroup(scope, dialog.id, name);
      setDialog(null);
    } catch (e) { setError(formatCallError(t, e)); }
    finally { setBusy(false); }
  }
  async function confirmDelete() {
    if (!removing || busy) return;
    setBusy(true); setError('');
    try {
      await deleteGroup(scope, removing.id);
      setRemoving(null);
    } catch (e) { setError(formatCallError(t, e)); }
    finally { setBusy(false); }
  }
  // 拖拽用指针事件手写：按下后移动超过阈值才算拖拽，松手时看指针底下是哪个落点。
  // 监听器挂在 window 上，所以指针移到卡片外面也照样跟得住。
  // label 会变成跟着光标走的小标签 —— 拖动时看得见自己拎着哪一条，才不会以为没反应。
  function dragProps(id: string, current?: string, label?: string): GroupDragSource {
    return {
      'data-draggable': 'true',
      ...(dragging === id ? { 'data-dragging': 'true' as const } : {}),
      onPointerDownCapture: event => {
        if (event.button !== 0) return; // 只认左键
        const from = current ?? '';
        const startX = event.clientX;
        const startY = event.clientY;
        let active = false;
        // 跟随光标的标签直接建在 document 上：pointermove 触发得很密，
        // 走 React 状态会让整个列表反复重渲染，所以只改这一颗节点的 transform。
        let chip: HTMLDivElement | null = null;
        const place = (x: number, y: number) => { if (chip) chip.style.transform = `translate3d(${x}px, ${y}px, 0)`; };

        const stop = () => {
          window.removeEventListener('pointermove', track, true);
          window.removeEventListener('pointerup', release, true);
          window.removeEventListener('pointercancel', abort, true);
          window.removeEventListener('blur', onBlur, true);
          document.body.classList.remove('group-dragging');
          chip?.remove();
          chip = null;
          setDragging(null);
          setOver(null);
        };
        const track = (moveEvent: PointerEvent) => {
          // 指针已经松开（比如在窗口外面松的手，pointerup 没送到）就收工，免得半挂着。
          if ((moveEvent.buttons & 1) === 0) { stop(); return; }
          if (!active) {
            if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD) return;
            active = true;
            setDragging(id);
            document.body.classList.add('group-dragging');
            chip = document.createElement('div');
            chip.className = 'group-drag-chip';
            chip.textContent = label ?? '';
            chip.setAttribute('aria-hidden', 'true');
            document.body.appendChild(chip);
          }
          // 按下的那一刻浏览器就在拉选文字了，事后再加 user-select: none 也撤不掉已经存在的选区
          // —— 拖到哪儿，哪儿的文字就整块变蓝。只能主动把它清掉。
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) selection.removeAllRanges();
          place(moveEvent.clientX, moveEvent.clientY);
          setOver(dropTargetAt(moveEvent.clientX, moveEvent.clientY));
        };
        const release = (upEvent: PointerEvent) => {
          const target = active ? dropTargetAt(upEvent.clientX, upEvent.clientY) : null;
          stop();
          if (!active) return;
          // 松手后浏览器还会补一次 click，吃掉它，免得顺带触发卡片上的标题按钮或播放按钮。
          // 摘掉监听只有两种情况：补上来的 click 到了（吃掉并摘掉），或者用户又按下了一次新的指针
          // （说明那次 click 属于新动作，不该再吃）。用定时器判断不了这件事 —— 留长了会吃掉
          // 用户的下一次正常点击，留短了又可能漏掉补上来的 click。
          const disarm = () => {
            window.removeEventListener('click', swallow, true);
            window.removeEventListener('pointerdown', disarm, true);
          };
          const swallow = (clickEvent: MouseEvent) => { clickEvent.stopPropagation(); clickEvent.preventDefault(); disarm(); };
          window.addEventListener('click', swallow, true);
          window.addEventListener('pointerdown', disarm, true);
          if (target !== null && target !== from) move([id], target);
        };
        const abort = () => stop();
        // 切到别的程序会丢掉 pointerup，靠 blur 收尾。但页面内部的焦点变化同样会冒到 window 上：
        // 按下按钮时按钮抢到焦点，原来有焦点的元素就 blur 一次 —— 若照单全收，等于一按就取消拖拽。
        // document.hasFocus() 正好区分这两种情况。
        const onBlur = () => { if (!document.hasFocus()) stop(); };

        window.addEventListener('pointermove', track, true);
        window.addEventListener('pointerup', release, true);
        window.addEventListener('pointercancel', abort, true);
        window.addEventListener('blur', onBlur, true);
      },
    };
  }
  function dropProps(groupId: string): GroupDropTarget {
    return {
      'data-group-drop': groupId,
      ...(over === groupId ? { 'data-drop-active': 'true' as const } : {}),
    };
  }
  return {
    openCreate: () => { setError(''); setDialog({ id: '', name: '' }); },
    openRename: (group: Group) => { setError(''); setDialog({ id: group.id, name: group.name }); },
    openDelete: (group: Group) => { setError(''); setRemoving(group); },
    move,
    dragging,
    dragProps,
    dropProps,
    dialogs: <>
      {dialog ? <GroupDialog title={t(dialog.id ? '@yovoice.group.rename' : '@yovoice.group.new')} initial={dialog.name}
        existing={groups.filter(group => group.id !== dialog.id).map(group => group.name)} busy={busy} error={error}
        onClose={() => setDialog(null)} onSubmit={name => void submit(name)} /> : null}
      {removing ? <GroupDeleteDialog name={removing.name} busy={busy} error={error}
        onClose={() => setRemoving(null)} onConfirm={() => void confirmDelete()} /> : null}
    </>,
  };
}
