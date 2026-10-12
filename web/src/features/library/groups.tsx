import { useRef, useState, type DragEvent, type ReactNode } from 'react';
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

/** 分组的两个作用域：参考音色与角色各自独立，与 Go 的 workbench.ScopeVoice/ScopeCharacter 对应。 */
export type GroupScope = 'voice' | 'character';

/** 分组名长度上限，与 Go 的 workbench.GroupNameLimit 一致。 */
export const GROUP_NAME_LIMIT = 60;

/** 「未分组」在筛选与折叠里需要一个稳定的键，服务端的分组 ID 不会与它相撞。 */
export const UNGROUPED_KEY = '@ungrouped';

/** 拖拽时携带的自定义 MIME，用来把列表内部的条目与外部拖入的文件区分开。 */
const ENTRY_MIME = 'application/x-yovoice-entry';

export const saveGroup = (scope: GroupScope, id: string, name: string) => call<Group>('group.save', { scope, id, name });
export const deleteGroup = (scope: GroupScope, id: string) => call('group.delete', { scope, id });
export const assignGroup = (scope: GroupScope, groupId: string, ids: string[]) => call('group.assign', { scope, groupId, ids });

/** 挂在可拖动的条目上，让它能把 id 交给分组落点。 */
export type GroupDragSource = {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

/** 挂在分组标题、筛选按钮这类落点上。groupId 为空串表示「未分组」。 */
export type GroupDropTarget = {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  'data-drop-active'?: 'true';
};

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
  // 记住拖拽起点所在的组：拖回原来的组就不必再打扰服务端。
  const origin = useRef('');

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
  // 拖拽用原生 HTML5 DnD：条目负责携带 id，分组标题与筛选按钮负责接收。
  // 自定义 MIME 用来识别「这是本列表内部的拖拽」，不依赖 React 的渲染时机，
  // 也不会把从资源管理器拖进来的文件误当成条目。
  function dragProps(id: string, current?: string): GroupDragSource {
    return {
      draggable: true,
      onDragStart: event => {
        setDragging(id);
        origin.current = current ?? '';
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(ENTRY_MIME, id);
        event.dataTransfer.setData('text/plain', id);
      },
      onDragEnd: () => { setDragging(null); setOver(null); },
    };
  }
  function dropProps(groupId: string): GroupDropTarget {
    return {
      onDragOver: event => {
        if (!Array.from(event.dataTransfer.types).includes(ENTRY_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(groupId);
      },
      onDragLeave: () => setOver(current => (current === groupId ? null : current)),
      onDrop: event => {
        const id = event.dataTransfer.getData(ENTRY_MIME) || event.dataTransfer.getData('text/plain');
        const from = origin.current;
        setDragging(null); setOver(null);
        if (!id) return;
        event.preventDefault();
        if (from !== groupId) move([id], groupId);
      },
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
