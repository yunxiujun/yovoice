package workbench

import (
	"slices"
	"strings"
	"time"

	"yovoice/internal/msg"
	"yovoice/internal/schema"
)

// 分组分两套作用域：参考音色与角色各自独立，同名分组互不影响。
const (
	ScopeVoice     = "voice"
	ScopeCharacter = "character"
	// GroupNameLimit 是分组名长度上限，与前端限制一致。
	GroupNameLimit = 60
	// MaxGroups 限制单套分组的数量，避免界面被无限增长的分组撑坏。
	MaxGroups = 100
)

func scopeValid(scope string) bool {
	return scope == ScopeVoice || scope == ScopeCharacter
}

// groupList 返回指定作用域的分组切片指针，让增删改三处共用同一份寻址逻辑。
func groupList(state *schema.State, scope string) *[]schema.Group {
	if scope == ScopeCharacter {
		return &state.CharacterGroups
	}
	return &state.VoiceGroups
}

// groupExists 判断分组是否可用。空 ID 表示未分组，始终有效。
func groupExists(state *schema.State, scope, id string) bool {
	if id == "" {
		return true
	}
	if !schema.ValidID(id) {
		return false
	}
	return slices.ContainsFunc(*groupList(state, scope), func(g schema.Group) bool { return g.ID == id })
}

// hasGroupName 判断同作用域内是否已有同名分组（忽略大小写），exclude 用于重命名时跳过自身。
func hasGroupName(groups []schema.Group, name, exclude string) bool {
	lower := strings.ToLower(name)
	return slices.ContainsFunc(groups, func(g schema.Group) bool {
		return g.ID != exclude && strings.ToLower(g.Name) == lower
	})
}

// SaveGroup 新建或重命名分组。id 为空时新建，否则重命名，返回保存后的分组。
func (w *Workbench) SaveGroup(scope, id, name string) (schema.Group, error) {
	if !scopeValid(scope) {
		return schema.Group{}, msg.Err(msg.ErrGroupInvalid, nil)
	}
	name = strings.TrimSpace(name)
	if name == "" || schema.TextLen(name) > GroupNameLimit {
		return schema.Group{}, msg.Err(msg.ErrGroupInvalid, nil)
	}
	w.edit.Lock()
	defer w.edit.Unlock()
	state := w.Store.Read()
	groups := *groupList(&state, scope)
	if id == "" {
		if len(groups) >= MaxGroups {
			return schema.Group{}, msg.Err(msg.ErrGroupLimit, nil)
		}
		if hasGroupName(groups, name, "") {
			return schema.Group{}, msg.Err(msg.ErrGroupInvalid, nil)
		}
		group := schema.Group{ID: schema.NewID(), Name: name, CreatedAt: time.Now().UTC()}
		if err := w.Store.Update(func(s *schema.State) {
			list := groupList(s, scope)
			*list = append(*list, group)
		}, true); err != nil {
			return schema.Group{}, err
		}
		return group, nil
	}
	if !schema.ValidID(id) {
		return schema.Group{}, msg.Err(msg.ErrGroupInvalid, nil)
	}
	index := slices.IndexFunc(groups, func(g schema.Group) bool { return g.ID == id })
	if index < 0 {
		return schema.Group{}, msg.Err(msg.ErrGroupInvalid, nil)
	}
	if hasGroupName(groups, name, id) {
		return schema.Group{}, msg.Err(msg.ErrGroupInvalid, nil)
	}
	if err := w.Store.Update(func(s *schema.State) {
		(*groupList(s, scope))[index].Name = name
	}, true); err != nil {
		return schema.Group{}, err
	}
	group := groups[index]
	group.Name = name
	return group, nil
}

// DeleteGroup 删除分组。组内成员回到未分组，音色与角色本身不会被删除。
func (w *Workbench) DeleteGroup(scope, id string) error {
	if !scopeValid(scope) || !schema.ValidID(id) {
		return msg.Err(msg.ErrGroupInvalid, nil)
	}
	w.edit.Lock()
	defer w.edit.Unlock()
	state := w.Store.Read()
	if index := slices.IndexFunc(*groupList(&state, scope), func(g schema.Group) bool { return g.ID == id }); index < 0 {
		return msg.Err(msg.ErrGroupInvalid, nil)
	}
	return w.Store.Update(func(s *schema.State) {
		list := groupList(s, scope)
		for i := range *list {
			if (*list)[i].ID == id {
				*list = slices.Delete(*list, i, i+1)
				break
			}
		}
		if scope == ScopeCharacter {
			for i := range s.Characters {
				if s.Characters[i].GroupID == id {
					s.Characters[i].GroupID = ""
				}
			}
			return
		}
		for i := range s.Voices {
			if s.Voices[i].GroupID == id {
				s.Voices[i].GroupID = ""
			}
		}
	}, true)
}

// AssignGroup 把若干条目移动到指定分组，groupID 为空表示移回未分组。
func (w *Workbench) AssignGroup(scope, groupID string, ids []string) error {
	if !scopeValid(scope) || (groupID != "" && !schema.ValidID(groupID)) || len(ids) == 0 {
		return msg.Err(msg.ErrGroupInvalid, nil)
	}
	w.edit.Lock()
	defer w.edit.Unlock()
	state := w.Store.Read()
	if !groupExists(&state, scope, groupID) {
		return msg.Err(msg.ErrGroupInvalid, nil)
	}
	return w.Store.Update(func(s *schema.State) {
		moved := make(map[string]bool, len(ids))
		for _, id := range ids {
			moved[id] = true
		}
		if scope == ScopeCharacter {
			for i := range s.Characters {
				if moved[s.Characters[i].ID] {
					s.Characters[i].GroupID = groupID
				}
			}
			return
		}
		for i := range s.Voices {
			if moved[s.Voices[i].ID] {
				s.Voices[i].GroupID = groupID
			}
		}
	}, true)
}
