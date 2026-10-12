import { useState, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { useLocale, useTranslator } from '@astryxdesign/core/i18n';
import { Clock3, FolderPlus, Mic, Play, Plus, X, MoreHorizontal } from 'lucide-react';
import { formatTime, projectKind, type Draft, type Generation, type State, type Track, type Voice } from '../../shared/workbench';
import { MediaActions } from '../media/media-actions';
import { Player } from '../media/player';
import { LibraryEmpty, LibraryPage, Ticket, TicketStamp } from './library-layout';
import { countByGroup, GroupActions, GroupEmpty, GroupFilter, GroupHeading, GroupMoveMenu, matchesGroup, sectionize, UNGROUPED_KEY, useGroupCollapse, useGroupEditing } from './groups';
import { WaveRing } from './wave-ring';
import { overflowTitle } from '../../shared/ui/overflow-title';

// 存根用的短时长：不足一小时显示 m:ss。
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export function MediaLibrary({ page, state, query, onQueryChange, track, audition, stop, suspended, addVoice, editVoice, reuse, onError, controls, project }: {
  controls?: ReactNode; project: Draft;
  page: 'voices' | 'history'; state: State; query: string; onQueryChange: (value: string) => void;
  track: Track | null; audition: (track: Track) => void; stop: () => void; suspended: boolean;
  addVoice: () => void; editVoice: (item: Voice | Generation) => void; reuse: (item: Generation) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const voices = page === 'voices';
  const groups = state.voiceGroups ?? [];
  const groupEditing = useGroupEditing('voice', groups, onError);
  const { collapsed, toggle } = useGroupCollapse('voice');
  const [filter, setFilter] = useState<string | null>(null);
  const history = projectKind(project) !== 'story' ? state.history.filter(item => item.settings.id === project.id && !item.segment).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const count = voices ? state.voices.length : history.length;
  const search = query.trim().toLocaleLowerCase();
  const filteredVoices = state.voices.filter(voice => voice.name.toLocaleLowerCase().includes(search));
  // 筛选指向的分组可能已经被删掉了，这种情况按「全部」处理，免得停在空列表上。
  const activeFilter = filter !== null && filter !== '' && !groups.some(group => group.id === filter) ? null : filter;
  const listedVoices = filteredVoices.filter(voice => matchesGroup(voice, groups, item => item.groupId, activeFilter));
  const { counts, ungrouped } = countByGroup(filteredVoices, groups, item => item.groupId);
  const speakerName = (item: Generation) => item.segment?.speakerName || state.characters.find(c => c.id === item.settings.characterId)?.name || t('@yovoice.library.narrator');
  const filteredHistory = history.filter(item => [item.title, item.settings.text, speakerName(item), state.drafts.find(d => d.id === item.settings.id)?.title ?? ''].some(value => value.toLocaleLowerCase().includes(search)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dateOptions: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  // 选定某个分组时平铺该组的全部内容；「全部」按分组分区浏览。一个分组都没有时保持原来的平铺列表，老用户看到的界面不变。
  const sections = voices && groups.length > 0 && activeFilter === null ? sectionize(filteredVoices, groups, voice => voice.groupId, search.length > 0) : null;
  // 参考音频：头像外围一圈声波，点卡片试听；存根显示时长。有分组时整条卡片可以拖到分组上。
  const voiceRow = (voice: Voice, index: number) => <Ticket key={voice.id} index={index} className="voice-row"
    drag={groups.length > 0 ? groupEditing.dragProps(voice.id, voice.groupId, voice.name) : undefined}
    cover={<WaveRing seed={voice.id} duration={voice.duration}><Player compact avatar={{ seed: voice.id, label: t('@yovoice.app.audition', { name: voice.name }), select: () => audition({ ...voice, kind: 'voices', subtitle: t('@yovoice.app.subtitleReference') }) }} suspended={suspended} track={track?.id === voice.id ? track : null} onError={onError} /></WaveRing>}
    eyebrow={[voice.fileName.split('.').pop()?.toUpperCase(), voice.source].filter(Boolean).join(' · ')}
    title={<h3 onPointerEnter={overflowTitle}>{voice.name}</h3>} excerpt={voice.referenceText?.trim()}
    stub={<TicketStamp value={clock(voice.duration)} unit={t('@yovoice.library.duration')} />}
    actions={<HStack gap={1}>
      {groups.length > 0 ? <GroupMoveMenu groups={groups} current={voice.groupId} onMove={groupId => groupEditing.move([voice.id], groupId)} /> : null}
      <MediaActions onEdit={() => editVoice(voice)} item={{ ...voice, kind: 'voices' }} beforeDelete={stop} onError={onError} />
    </HStack>} />;
  return <>
    <LibraryPage controls={voices ? controls : undefined} title={voices ? t('@yovoice.library.voicesTitle') : `${project.title} · ${t('@yovoice.history.versions')}`}
      actions={voices && count > 0 ? <HStack gap={2}>
        <Button label={t('@yovoice.group.new')} size="sm" variant="secondary" icon={<FolderPlus />} onClick={groupEditing.openCreate} />
        <Button label={t('@yovoice.library.addVoice')} size="sm" icon={<Plus />} onClick={addVoice} />
      </HStack> : voices ? undefined : controls}
      toolbar={voices && groups.length > 0 ? <GroupFilter groups={groups} value={activeFilter} counts={counts} ungrouped={ungrouped}
        onChange={setFilter} drop={groupEditing.dropProps} /> : undefined}
      query={query} onQueryChange={onQueryChange} searchLabel={t(voices ? '@yovoice.library.searchVoices' : '@yovoice.library.searchHistory')}
      hasItems={count > 0} hasResults={(voices ? listedVoices : filteredHistory).length > 0} layout={voices ? 'tickets' : 'list'}
      noResults={t('@yovoice.library.noSearchResults')}
      empty={<LibraryEmpty icon={<Clock3 />} art={voices ? <WaveRing seed="empty-voice" duration={12}><HStack className="empty-ring-mark" gap={0} hAlign="center" vAlign="center"><Mic /></HStack></WaveRing> : undefined} title={t(voices ? '@yovoice.library.emptyVoicesTitle' : '@yovoice.library.emptyHistoryTitle')}
        action={voices ? <Button label={t('@yovoice.library.addFirstVoice')} size="sm" icon={<Plus />} onClick={addVoice} /> : null} />}>
      {voices
        ? sections
          ? sections.map(section => {
            const group = section.group;
            // 「未分组」用单独的键，免得和真实分组 ID 撞车。
            const key = group ? group.id : UNGROUPED_KEY;
            const folded = collapsed.includes(key);
            return <VStack key={key} className="group-section" gap={3} data-collapsed={folded}>
              <GroupHeading name={group ? group.name : t('@yovoice.group.ungrouped')} count={section.items.length} detached={!group}
                collapsed={folded} onToggle={() => toggle(key)} drop={groupEditing.dropProps(group ? group.id : '')}
                actions={group ? <GroupActions onRename={() => groupEditing.openRename(group)} onDelete={() => groupEditing.openDelete(group)} /> : null} />
              {folded ? null : section.items.length === 0 ? <GroupEmpty text={t('@yovoice.group.empty')} /> : section.items.map(voiceRow)}
            </VStack>;
          })
          : listedVoices.map(voiceRow)
        : filteredHistory.map(item => <VStack key={item.id} className="history-item" gap={0}>
            <HStack className="history-row" gap={3} vAlign="center">
              <Button label={t(track?.id === item.id ? '@yovoice.app.collapseAudition' : '@yovoice.app.audition', { name: item.title })} size="sm" variant="ghost" isIconOnly icon={track?.id === item.id ? <X /> : <Play />} onClick={() => audition({ id: item.id, name: item.title, fileName: item.fileName, kind: 'outputs', subtitle: t('@yovoice.app.subtitleOutput') })} />
              <VStack gap={1} className="history-info"><h3 onPointerEnter={overflowTitle} data-full-text={item.settings.text}>{item.settings.text.trim() || item.title}</h3><HStack className="history-meta" gap={3}><small>{t('@yovoice.app.historyVersion', { n: history.length - history.indexOf(item) })}</small><small>{new Date(item.createdAt).toLocaleString(locale, dateOptions)}</small></HStack></VStack>
              <small className="time">{formatTime(item.duration)}</small>
              <HStack className="history-actions" gap={1}>
                <DropdownMenu className="audio-actions-menu" presentation="popover" alignment="end" hasChevron={false} button={{ label: t('@yovoice.history.audioActions'), size: 'sm', variant: 'ghost', isIconOnly: true, icon: <MoreHorizontal /> }} items={[
                  { label: t('@yovoice.voice.save'), onClick: () => editVoice(item) },
                  { label: t('@yovoice.app.reuseSettings'), onClick: () => reuse(item) },
                ]} />
                <MediaActions item={{ id: item.id, kind: 'outputs', name: item.title }} beforeDelete={stop} onError={onError} />
              </HStack>
            </HStack>
            {track?.id === item.id ? <Player compact suspended={suspended} track={track} onError={onError} /> : null}
          </VStack>)}
    </LibraryPage>
    {voices ? groupEditing.dialogs : null}
  </>;
}
