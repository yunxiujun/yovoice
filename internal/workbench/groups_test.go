package workbench

import (
	"strings"
	"testing"

	"yovoice/internal/schema"
)

// 三套作用域各自独立：同名的分组可以同时存在于参考音色、角色和作品里，
// 通过作品作用域归类也不会碰到音色。
func TestGroupScopesAreIndependent(t *testing.T) {
	w, err := New(t.TempDir())
	must(t, err)
	defer w.Close()
	draftGroup, err := w.SaveGroup(ScopeDraft, "", "第一幕")
	must(t, err)
	voiceGroup, err := w.SaveGroup(ScopeVoice, "", "第一幕")
	must(t, err)
	if draftGroup.ID == voiceGroup.ID {
		t.Fatal("不同作用域拿到了同一个分组 ID")
	}
	voice := schema.Voice{ID: schema.NewID(), Name: "旁白音色", FileName: "narration.wav", Duration: 3, GroupID: voiceGroup.ID}
	must(t, w.Store.Update(func(s *schema.State) { s.Voices = append(s.Voices, voice) }, true))
	state := w.Store.Read()
	if len(state.DraftGroups) != 1 || len(state.VoiceGroups) != 1 || len(state.CharacterGroups) != 0 {
		t.Fatalf("分组没有落到各自的作用域: %+v / %+v", state.DraftGroups, state.VoiceGroups)
	}
	// 拿音色的 ID 走作品作用域的归类，音色不该被牵动。
	draftID := state.Drafts[0].ID
	must(t, w.AssignGroup(ScopeDraft, draftGroup.ID, []string{draftID, voice.ID}))
	state = w.Store.Read()
	if state.Voices[0].GroupID != voiceGroup.ID {
		t.Fatalf("作品作用域改到了音色的归属: %q", state.Voices[0].GroupID)
	}
	if state.Drafts[0].GroupID != draftGroup.ID {
		t.Fatalf("作品归类没生效: %q", state.Drafts[0].GroupID)
	}
	// 删掉作品分组也不能碰音色。
	must(t, w.DeleteGroup(ScopeDraft, draftGroup.ID))
	state = w.Store.Read()
	if len(state.VoiceGroups) != 1 || state.Voices[0].GroupID != voiceGroup.ID {
		t.Fatalf("删除作品分组影响到了音色: %+v", state.VoiceGroups)
	}
}

// 作品分组：归类、编辑器再次保存不会冲掉归属、移回未分组、删组后作品保留。
func TestDraftGroupSurvivesSave(t *testing.T) {
	w, err := New(t.TempDir())
	must(t, err)
	defer w.Close()
	draft := w.Store.Read().Drafts[0]
	group, err := w.SaveGroup(ScopeDraft, "", "第一幕")
	must(t, err)
	must(t, w.AssignGroup(ScopeDraft, group.ID, []string{draft.ID}))
	if got := w.Store.Read().Drafts[0].GroupID; got != group.ID {
		t.Fatalf("归类没生效: %q", got)
	}
	// 编辑器里那份副本是在分组之前载入的，再次保存时 groupId 还是空的 —— 不能把归属冲掉。
	must(t, w.SaveDraft(draft))
	if got := w.Store.Read().Drafts[0].GroupID; got != group.ID {
		t.Fatalf("保存作品把分组归属冲掉了: %q", got)
	}
	// 带着过期的分组 ID 保存也一样：分组只认已存的那份。
	stale := draft
	stale.GroupID = schema.NewID()
	must(t, w.SaveDraft(stale))
	if got := w.Store.Read().Drafts[0].GroupID; got != group.ID {
		t.Fatalf("过期的分组 ID 覆盖了已存的归属: %q", got)
	}
	must(t, w.AssignGroup(ScopeDraft, "", []string{draft.ID}))
	if got := w.Store.Read().Drafts[0].GroupID; got != "" {
		t.Fatalf("移回未分组失败: %q", got)
	}
	// 删除分组：成员回到未分组，作品本身保留。
	must(t, w.AssignGroup(ScopeDraft, group.ID, []string{draft.ID}))
	must(t, w.DeleteGroup(ScopeDraft, group.ID))
	state := w.Store.Read()
	if len(state.DraftGroups) != 0 || len(state.Drafts) != 1 || state.Drafts[0].GroupID != "" {
		t.Fatalf("删除分组后的状态不对: %d 个分组 / %d 个作品 / %q", len(state.DraftGroups), len(state.Drafts), state.Drafts[0].GroupID)
	}
}

// 分组协议的边界：作用域、分组名、分组 ID、归类目标都有校验，重命名不许撞名。
func TestGroupValidation(t *testing.T) {
	w, err := New(t.TempDir())
	must(t, err)
	defer w.Close()
	draftID := w.Store.Read().Drafts[0].ID
	if _, err := w.SaveGroup("album", "", "第一幕"); err == nil {
		t.Fatal("接受了未知作用域")
	}
	if _, err := w.SaveGroup(ScopeDraft, "", "   "); err == nil {
		t.Fatal("接受了空分组名")
	}
	if _, err := w.SaveGroup(ScopeDraft, "", strings.Repeat("长", GroupNameLimit+1)); err == nil {
		t.Fatal("接受了超长分组名")
	}
	if err := w.DeleteGroup(ScopeDraft, "not-an-id"); err == nil {
		t.Fatal("接受了非法分组 ID")
	}
	if err := w.AssignGroup(ScopeDraft, schema.NewID(), []string{draftID}); err == nil {
		t.Fatal("归类到了不存在的分组")
	}
	if err := w.AssignGroup(ScopeDraft, "", nil); err == nil {
		t.Fatal("接受了空的归类列表")
	}
	first, err := w.SaveGroup(ScopeDraft, "", "第一幕")
	must(t, err)
	second, err := w.SaveGroup(ScopeDraft, "", "第二幕")
	must(t, err)
	if _, err := w.SaveGroup(ScopeDraft, first.ID, second.Name); err == nil {
		t.Fatal("允许重命名成已有分组名")
	}
	if _, err := w.SaveGroup(ScopeDraft, schema.NewID(), "第三幕"); err == nil {
		t.Fatal("重命名了不存在的分组")
	}
	renamed, err := w.SaveGroup(ScopeDraft, first.ID, "序幕")
	must(t, err)
	if renamed.ID != first.ID || renamed.Name != "序幕" {
		t.Fatalf("重命名结果不对: %+v", renamed)
	}
	// 重命名不影响成员归属。
	must(t, w.AssignGroup(ScopeDraft, first.ID, []string{draftID}))
	if _, err := w.SaveGroup(ScopeDraft, first.ID, "开场"); err != nil {
		t.Fatal(err)
	}
	if got := w.Store.Read().Drafts[0].GroupID; got != first.ID {
		t.Fatalf("重命名后成员归属变了: %q", got)
	}
}
