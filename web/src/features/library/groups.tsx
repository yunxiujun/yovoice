import { useState, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useTranslator } from '@astryxdesign/core/i18n';
import { Check, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { AppDialog, ConfirmDelete } from '../../shared/ui/app-dialog';
import { call } from '../../shared/lib/client';
import { formatCallError } from '../../shared/i18n/format';
import { overflowTitle } from '../../shared/ui/overflow-title';
import type { Group } from '../../shared/workbench';

/** 分组的两个作用域：参考音色与角色各自独立，与 Go 的 workbench.ScopeVoice/ScopeCharacter 对应。 */
export type GroupScope = 'voice' | 'character';

/** 分组名长度上限，与 Go 的 workbench.GroupNameLimit 一致。 */
export const GROUP_NAME_LIMIT = 60;

export const saveGroup = (scope: GroupScope, id: string, name: string) => call<Group>('group.save', { scope, id, name });
export const deleteGroup = (scope: GroupScope, id: string) => call('group.delete', { scope, id });
export const assignGroup = (scope: GroupScope, groupId: string, ids: string[]) => call('group.assign', { scope, groupId, ids });

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

/** 分组区块的标题栏：组名、成员数和右侧操作。detached 标记「未分组」这一虚拟区块。 */
export function GroupHeading({ name, count, actions, detached }: { name: string; count: number; actions?: ReactNode; detached?: boolean }) {
  const t = useTranslator();
  return <HStack className="group-heading" gap={3} vAlign="center" hAlign="between" data-detached={!!detached}>
    <HStack className="group-heading-label" gap={2} vAlign="center">
      <h2 onPointerEnter={overflowTitle}>{name}</h2>
      <small className="group-count">{t('@yovoice.group.count', { count })}</small>
    </HStack>
    {actions}
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

/**
 * 分组的新建、重命名、删除与移动。两个列表页共用同一套状态机，保证交互一致。
 * 返回的 dialogs 是受控弹窗节点，由调用方渲染在页面中。
 */
export function useGroupEditing(scope: GroupScope, groups: Group[], onError: (message: string) => void) {
  const t = useTranslator();
  const [dialog, setDialog] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
  return {
    openCreate: () => { setError(''); setDialog({ id: '', name: '' }); },
    openRename: (group: Group) => { setError(''); setDialog({ id: group.id, name: group.name }); },
    openDelete: (group: Group) => { setError(''); setRemoving(group); },
    move: (ids: string[], groupId: string) => { void assignGroup(scope, groupId, ids).catch(e => onError(formatCallError(t, e))); },
    dialogs: <>
      {dialog ? <GroupDialog title={t(dialog.id ? '@yovoice.group.rename' : '@yovoice.group.new')} initial={dialog.name}
        existing={groups.filter(group => group.id !== dialog.id).map(group => group.name)} busy={busy} error={error}
        onClose={() => setDialog(null)} onSubmit={name => void submit(name)} /> : null}
      {removing ? <GroupDeleteDialog name={removing.name} busy={busy} error={error}
        onClose={() => setRemoving(null)} onConfirm={() => void confirmDelete()} /> : null}
    </>,
  };
}
