import { useState, type ReactNode, type ComponentProps } from 'react';
import { formatNotice } from '../../shared/i18n/format';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useTranslator } from '@astryxdesign/core/i18n';
import { Copy, FileMusic, FolderInput, FolderPlus, History, Mic, MoreHorizontal, Music, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppDialog } from '../../shared/ui/app-dialog';
import { createDraft, formatTime, projectKind, type Draft, type Group, type UiLocale } from '../../shared/workbench';
import { call, isDesktop } from '../../shared/lib/client';
import { noticeMessage } from '../../shared/lib/call-error';
import { SpeakerAvatar } from '../create/subtitles';
import { createMusicDraft } from '../music/music-draft';
import { createScoreDraft, scoreDuration } from '../score/score-draft';
import { RecordCover } from './record-cover';
import { LibraryEmpty, LibraryPage, Ticket } from './library-layout';
import { countByGroup, GroupActions, GroupEmpty, GroupFilter, GroupHeading, GroupMoveMenu, matchesGroup, sectionize, UNGROUPED_KEY, useGroupCollapse, useGroupEditing } from './groups';
import { TapeCover } from './tape-cover';
import { overflowTitle } from '../../shared/ui/overflow-title';

export function NewProject({ locale, modelId, create, onError, button, kind }: {
  kind?: 'text' | 'story' | 'music' | 'score'; locale: UiLocale; modelId?: string; create: (draft: Draft) => Promise<void>; onError: (error: string) => void;
  button?: Omit<ComponentProps<typeof Button>, 'onClick' | 'label'> & { label?: string };
}) {
  const t = useTranslator();
  const [busy, setBusy] = useState(false);
  async function start(kind: 'text' | 'story' | 'music' | 'score') {
    setBusy(true);
    const next: Draft = kind === 'music' ? createMusicDraft(locale, false) : kind === 'score' ? createScoreDraft(locale, false) : { ...createDraft(false, locale, modelId), kind };
    if (kind === 'story') next.subtitles = { speakers: [{ id: crypto.randomUUID(), sourceName: t('@yovoice.library.narrator') }], cues: [] };
    try { await create(next); }
    catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  }
  if (kind) return <Button label={t(`@yovoice.project.new.${kind}`)} icon={<Plus />} size="sm" {...button} isLoading={busy} onClick={() => void start(kind)} />;
  return <DropdownMenu data-testid={button?.['data-testid']} presentation="popover" hasChevron={false}
    button={{ label: t('@yovoice.project.new'), icon: <Plus />, size: 'sm', ...button, isLoading: busy }}
    items={[
      // 图标与侧栏导航一致。
      { id: 'story', label: t('@yovoice.project.story'), icon: <Pencil className="project-menu-icon" strokeWidth={1.5} />, onClick: () => void start('story') },
      { id: 'text', label: t('@yovoice.project.text'), icon: <Mic className="project-menu-icon" strokeWidth={1.5} />, onClick: () => void start('text') },
      { id: 'music', label: t('@yovoice.project.music'), icon: <Music className="project-menu-icon" strokeWidth={1.5} />, onClick: () => void start('music') },
      { id: 'score', label: t('@yovoice.project.score'), icon: <FileMusic className="project-menu-icon" strokeWidth={1.5} />, onClick: () => void start('score') },
      ...(isDesktop ? [{ id: 'import', label: t('@yovoice.timeline.importProject'), icon: <FolderInput className="project-menu-icon" strokeWidth={1.5} />, onClick: () => { setBusy(true); void call<Draft | null>('project.import').then(d => d ? create(d) : undefined).catch(e => onError(noticeMessage(e))).finally(() => setBusy(false)); } }] : []),
    ]} />;
}

export function Projects({ drafts, groups, kind, open, create, copy, save, remove, history, onError }: { onError: (error: string) => void;
  drafts: Draft[]; groups: Group[]; kind: 'text' | 'story' | 'music' | 'score'; open: (draft: Draft) => void; create: ReactNode;
  history: (draft: Draft) => void; copy: (draft: Draft) => void; save: (draft: Draft) => Promise<void>; remove: (draft: Draft) => void;
}) {
  const t = useTranslator();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const groupEditing = useGroupEditing('draft', groups, onError);
  const { collapsed, toggle } = useGroupCollapse('draft');
  const searching = query.trim().length > 0;
  const hasItems = drafts.some(d => projectKind(d) === kind);
  const filtered = drafts.filter(d => projectKind(d) === kind && d.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  // 筛选指向的分组可能已被删掉，这种情况按「全部」处理，免得停在空列表上。
  const activeFilter = filter !== null && filter !== '' && !groups.some(group => group.id === filter) ? null : filter;
  const listed = filtered.filter(d => matchesGroup(d, groups, item => item.groupId, activeFilter));
  const { counts, ungrouped } = countByGroup(filtered, groups, item => item.groupId);
  // 建了分组就按分组分区；一个分组都没有时沿用原来的按月分区，老用户看到的界面不变。
  const sections = groups.length > 0 && activeFilter === null ? sectionize(filtered, groups, d => d.groupId, searching) : null;
  // 卡片上方的一行等宽细节：故事的角色和台词数、语音字数、歌曲风格、编曲速度与时长。
  const projectMeta = (draft: Draft) => kind === 'story' ? [t('@yovoice.subtitle.cues', { count: draft.subtitles?.cues.length ?? 0 }), ...(draft.subtitles?.speakers ?? []).slice(0, 3).map(s => s.sourceName)].join(' · ')
    : kind === 'music' ? [draft.instrumental ? t('@yovoice.music.instrumental') : '', draft.text.split(/[,，]/)[0]?.trim()].filter(Boolean).join(' · ') || t('@yovoice.project.music')
    : kind === 'score' ? draft.score?.tracks.length ? `${draft.score.tempo} BPM · ${formatTime(scoreDuration(draft.score))}` : t('@yovoice.project.score')
    : t('@yovoice.app.charCount', { count: [...draft.text].length });
  // 摘录：歌曲取第一句歌词，编曲列出声部，其余取正文。
  const excerpt = (draft: Draft) => kind === 'music' ? (draft.lyrics ?? '').split('\n').map(line => line.trim()).find(line => line && !/^\[.*\]$/.test(line)) ?? ''
    : kind === 'score' ? (draft.score?.tracks ?? []).map(track => track.name).join(' · ') : draft.text.trim();
  // 按最近修改的月份分组；没有日期的旧作品不显示分组。
  const monthOf = (draft?: Draft) => { const stamp = draft?.updatedAt ?? draft?.createdAt; return stamp ? new Date(stamp).toLocaleDateString(document.documentElement.lang || undefined, { year: 'numeric', month: 'long' }) : ''; };
  // 卡片本体。建了分组时整张卡片都能拖到分组名或筛选标签上。
  const projectCard = (draft: Draft, index: number) => {
    const stamp = draft.updatedAt ?? draft.createdAt, date = new Date(stamp ?? 0);
    const lead = draft.subtitles?.speakers ?? [];
    const avatarSeed = (id: string, characterId?: string) => characterId ?? `${draft.id}:${id}`;
    // 歌曲和编曲是唱片封套；故事是封套上站着出场角色的有声唱片；语音是一盒写着标题的磁带。
    const cover = kind === 'music' || kind === 'score' ? <RecordCover seed={draft.id} title={draft.title} />
      : kind === 'story' ? <RecordCover seed={draft.id} title={draft.title} cast={lead.slice(0, 3).map(s => <SpeakerAvatar key={s.id} seed={avatarSeed(s.id, s.characterId)} />)} />
      : <TapeCover seed={draft.id} title={draft.title} />;
    return <Ticket key={draft.id} className={`project-library-row ticket-${kind}`} coverClassName="project-avatars" index={index} cover={cover}
      drag={groups.length > 0 ? groupEditing.dragProps(draft.id, draft.groupId, draft.title) : undefined}
      eyebrow={projectMeta(draft)} excerpt={excerpt(draft)}
      title={<Button variant="ghost" className="project-title" label={draft.title} onPointerEnter={overflowTitle} onClick={() => open(draft)} />}
      actions={groups.length > 0 ? <GroupMoveMenu groups={groups} current={draft.groupId} onMove={groupId => groupEditing.move([draft.id], groupId)} /> : undefined}
      stub={stamp ? <time className="project-created" dateTime={stamp} title={t('@yovoice.project.created', { date: new Date(draft.createdAt ?? date).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) })}>
        <b className="ticket-day">{date.getDate()}</b>
        <small className="eyebrow">{date.getFullYear()}.{String(date.getMonth() + 1).padStart(2, '0')}</small>
      </time> : null}
      stubActions={<DropdownMenu presentation="popover" alignment="end" menuWidth="calc(var(--spacing-10) * 4)" hasChevron={false}
        button={{ label: t('@yovoice.project.more'), icon: <MoreHorizontal />, isIconOnly: true, variant: 'ghost', size: 'sm' }}
        items={[
          ...(isDesktop ? [{ label: t('@yovoice.timeline.package'), onClick: () => void save(draft).then(() => call('project.export', { id: draft.id, name: draft.title })).catch(e => onError(noticeMessage(e))) }] : []),
          { id: 'rename', label: t('@yovoice.project.renameShort'), icon: <Pencil className="project-menu-icon" strokeWidth={1.5} />, onClick: () => { setError(''); setRenaming(draft); } },
          { id: 'copy', label: t('@yovoice.project.copyShort'), icon: <Copy className="project-menu-icon" strokeWidth={1.5} />, onClick: () => copy(draft) },
          ...(kind !== 'story' ? [{ id: 'history', label: t('@yovoice.history.versions'), icon: <History className="project-menu-icon" strokeWidth={1.5} />, onClick: () => history(draft) }] : []),
          { id: 'delete', label: t('@yovoice.action.delete'), icon: <Trash2 className="project-menu-icon" strokeWidth={1.5} />, variant: 'destructive', onClick: () => remove(draft) },
        ]} />} />;
  };
  // 卡片上方的月份标签：和上一条不在同一个月就印一条。按分组浏览时组内不再按月切分。
  const monthBanner = (draft: Draft, previous?: Draft) => {
    const month = monthOf(draft);
    return !!month && month !== monthOf(previous) ? <small className="ticket-month eyebrow">{month}</small> : null;
  };
  async function update(next: Draft) {
    setBusy(true); setError('');
    try { await save(next); setRenaming(null); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <LibraryPage title={t(`@yovoice.project.${kind}`)} layout="tickets"
      actions={<HStack gap={2}>
        <Button label={t('@yovoice.group.new')} size="sm" variant="secondary" icon={<FolderPlus />} onClick={groupEditing.openCreate} />
        {create}
      </HStack>}
      toolbar={groups.length > 0 ? <GroupFilter groups={groups} value={activeFilter} counts={counts} ungrouped={ungrouped}
        onChange={setFilter} drop={groupEditing.dropProps} /> : undefined}
      query={query} onQueryChange={setQuery} searchLabel={t('@yovoice.project.search')} hasItems={hasItems} hasResults={listed.length > 0}
      noResults={t('@yovoice.library.noSearchResults')}
      empty={<LibraryEmpty art={kind === 'text' ? <TapeCover seed={`empty-${kind}`} title={t(`@yovoice.project.${kind}`)} /> : <RecordCover seed={`empty-${kind}`} title={t(`@yovoice.project.${kind}`)} />} title={t('@yovoice.project.empty')} action={create} />}>
      {sections
        ? sections.map(section => {
          const group = section.group;
          // 「未分组」用单独的键，免得和真实分组 ID 撞车。
          const key = group ? group.id : UNGROUPED_KEY;
          const folded = collapsed.includes(key);
          return <VStack key={key} className="group-section" gap={3} data-collapsed={folded}>
            <GroupHeading name={group ? group.name : t('@yovoice.group.ungrouped')} count={section.items.length} detached={!group}
              collapsed={folded} onToggle={() => toggle(key)} drop={groupEditing.dropProps(group ? group.id : '')}
              actions={group ? <GroupActions onRename={() => groupEditing.openRename(group)} onDelete={() => groupEditing.openDelete(group)} /> : null} />
            {folded ? null : section.items.length === 0 ? <GroupEmpty text={t('@yovoice.group.empty')} /> : section.items.map(projectCard)}
          </VStack>;
        })
        : listed.map((draft, index) => <VStack key={draft.id} gap={2}>{monthBanner(draft, listed[index - 1])}{projectCard(draft, index)}</VStack>)}
    </LibraryPage>
    {groupEditing.dialogs}
    {renaming ? <AppDialog title={t('@yovoice.project.rename')} busy={busy} error={formatNotice(t, error)} onClose={() => setRenaming(null)} actions={<>
      <Button label={t('@yovoice.action.cancel')} isDisabled={busy} onClick={() => setRenaming(null)} />
      <Button label={t('@yovoice.action.save')} variant="primary" isLoading={busy} isDisabled={!renaming.title.trim() || renaming.title.length > 120} onClick={() => void update({ ...renaming, title: renaming.title.trim() })} />
    </>}><TextInput label={t('@yovoice.app.titleLabel')} value={renaming.title} onChange={title => setRenaming({ ...renaming, title })} /></AppDialog> : null}
  </>;
}
