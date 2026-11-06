import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, CalendarDays, Check, ChevronDown, CircleHelp, FolderKanban,
  LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, Tags, Trash2,
  Users, X, Pencil, Leaf, LoaderCircle
} from 'lucide-react'
import { isConfigured, supabase } from './supabase'

const navItems = [
  { id: 'records', label: '工作紀錄', icon: BookOpen },
  { id: 'projects', label: '專案管理', icon: FolderKanban },
  { id: 'subjects', label: '對象管理', icon: Users },
  { id: 'settings', label: '分類與標籤', icon: Tags },
]
const today = () => new Date().toISOString().slice(0, 10)

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [active, setActive] = useState('records')
  const [logs, setLogs] = useState([])
  const [categories, setCategories] = useState([])
  const [projects, setProjects] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ log_date: today(), title: '', summary: '', items: [{ content: '', category_id: '', project_id: '' }] })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadData()
  }, [session])

  async function loadData() {
    setBusy(true)
    const [logRes, catRes, projectRes] = await Promise.all([
      supabase.from('work_logs').select('id,user_id,log_date,title,summary,created_at,updated_at').order('log_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('work_categories').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('projects').select('id,name').eq('is_active', true).order('name'),
    ])
    if (logRes.error) setNotice(`讀取工作紀錄失敗：${logRes.error.message}`)
    else {
      const base = logRes.data || []
      if (base.length) {
        const ids = base.map(x => x.id)
        const { data: itemRows, error } = await supabase.from('work_items')
          .select('id,log_id,content,notes,sort_order,category_id,project_id,project_name')
          .in('log_id', ids).order('sort_order')
        if (error) setNotice(`讀取工作項目失敗：${error.message}`)
        const enriched = base.map(log => ({ ...log, items: (itemRows || []).filter(item => item.log_id === log.id) }))
        setLogs(enriched)
      } else setLogs([])
    }
    if (catRes.error) setNotice(`讀取分類失敗：${catRes.error.message}`)
    else setCategories(catRes.data || [])
    if (projectRes.error) setNotice(`讀取專案失敗：${projectRes.error.message}`)
    else setProjects(projectRes.data || [])
    setBusy(false)
  }

  async function signIn(e) {
    e.preventDefault(); setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setLogs([])
  }

  function openNew() {
    setEditing(null)
    setForm({ log_date: today(), title: '', summary: '', items: [{ content: '', category_id: '', project_id: '' }] })
    setModal(true)
  }

  function openEdit(log) {
    setEditing(log)
    setForm({
      log_date: log.log_date,
      title: log.title,
      summary: log.summary || '',
      items: log.items?.length ? log.items.map(i => ({
        id: i.id, content: i.content, category_id: i.category_id || '', project_id: i.project_id || ''
      })) : [{ content: '', category_id: '', project_id: '' }]
    })
    setModal(true)
  }

  function updateItem(index, key, value) {
    setForm(old => ({ ...old, items: old.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }))
  }

  async function saveLog(e) {
    e.preventDefault()
    const cleanItems = form.items.filter(x => x.content.trim())
    if (!form.title.trim()) { setNotice('請填寫工作紀錄標題。'); return }
    if (!cleanItems.length) { setNotice('至少新增一個工作項目。'); return }
    setBusy(true); setNotice('')
    try {
      let logId = editing?.id
      if (editing) {
        const { error } = await supabase.from('work_logs').update({
          log_date: form.log_date, title: form.title.trim(), summary: form.summary.trim() || null
        }).eq('id', logId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('work_logs').insert({
          log_date: form.log_date, title: form.title.trim(), summary: form.summary.trim() || null
        }).select('id').single()
        if (error) throw error
        logId = data.id
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData.user.id
      const existingIds = cleanItems.filter(item => item.id).map(item => item.id)
      const removedIds = (editing?.items || []).filter(item => !existingIds.includes(item.id)).map(item => item.id)

      // 只刪除使用者在編輯畫面移除的工作項目，保留其他項目的標籤及對象關聯。
      if (removedIds.length) {
        const { error } = await supabase.from('work_items').delete().eq('log_id', logId).in('id', removedIds)
        if (error) throw error
      }

      for (const [index, item] of cleanItems.entries()) {
        const row = {
          user_id: userId,
          log_id: logId,
          content: item.content.trim(),
          category_id: item.category_id || null,
          project_id: item.project_id || null,
          sort_order: index + 1
        }
        if (item.id) {
          const { error } = await supabase.from('work_items').update(row).eq('id', item.id).eq('log_id', logId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('work_items').insert(row)
          if (error) throw error
        }
      }
      setModal(false)
      setNotice(editing ? '工作紀錄已更新。' : '工作紀錄已新增。')
      await loadData()
    } catch (err) {
      setNotice(`儲存失敗：${err.message}`)
    } finally { setBusy(false) }
  }

  async function deleteLog(log) {
    if (!window.confirm(`確定刪除「${log.title}」？此操作無法復原。`)) return
    setBusy(true); setNotice('')
    const { error } = await supabase.from('work_logs').delete().eq('id', log.id)
    if (error) setNotice(`刪除失敗：${error.message}`)
    else { setNotice('工作紀錄已刪除。'); await loadData() }
    setBusy(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return logs
    return logs.filter(log =>
      [log.title, log.summary, log.log_date, ...(log.items || []).map(i => i.content)].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [logs, search])

  if (!isConfigured) return <SetupScreen />
  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" />正在連線…</div>
  if (!session) return <main className="login-wrap">
    <section className="login-card">
      <div className="brand-mark"><Leaf size={25}/></div>
      <p className="eyebrow">MY WORKSPACE</p>
      <h1>工作紀錄資料庫</h1>
      <p className="muted">整理日常工作，留下可搜尋的經驗。</p>
      <form onSubmit={signIn} className="login-form">
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="輸入登入 Email" required /></label>
        <label>密碼<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="輸入密碼" required /></label>
        {authError && <p className="error-text">{authError}</p>}
        <button className="primary-btn full" type="submit">登入工作資料庫</button>
      </form>
      <p className="tiny-note">此網站僅供已建立的帳號登入，不提供公開註冊。</p>
    </section>
  </main>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark small"><Leaf size={19}/></div><div><strong>工作紀錄</strong><small>MY WORKSPACE</small></div></div>
      <div className="nav-label">工作空間</div>
      <nav>{navItems.map(item => {
        const Icon = item.icon
        return <button key={item.id} className={`nav-link ${active === item.id ? 'selected' : ''}`} onClick={() => setActive(item.id)}><Icon size={18}/>{item.label}</button>
      })}</nav>
      <div className="sidebar-bottom">
        <div className="profile-dot">{session.user.email?.[0]?.toUpperCase() || 'U'}</div>
        <div className="profile-info"><strong>個人工作空間</strong><small>{session.user.email}</small></div>
        <button className="icon-btn" title="登出" onClick={signOut}><LogOut size={17}/></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div><p className="eyebrow">WORKSPACE / {active.toUpperCase()}</p><h1>{navItems.find(x => x.id === active)?.label || '工作紀錄'}</h1></div>
        <div className="top-actions"><span className="date-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString('zh-TW')}</span><div className="avatar">{session.user.email?.[0]?.toUpperCase() || 'U'}</div></div>
      </header>

      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice('')}><X size={16}/></button></div>}

      {active === 'records' ? <>
        <section className="welcome-panel">
          <div><span className="sun-dot"></span><span className="welcome-kicker">KEEP YOUR WORK IN ONE PLACE</span><h2>每一份工作，都值得好好記錄。</h2><p>把做過的事情整理起來，未來查找與回顧都更容易。</p></div>
          <div className="sun-graphic" aria-hidden="true"></div>
        </section>
        <section className="stats-row">
          <div className="stat-card mint"><span>紀錄總數</span><strong>{logs.length}</strong><small>已累積的工作紀錄</small></div>
          <div className="stat-card yellow"><span>本月紀錄</span><strong>{logs.filter(x => x.log_date?.slice(0,7) === today().slice(0,7)).length}</strong><small>這個月新增的紀錄</small></div>
          <div className="stat-card pink"><span>工作項目</span><strong>{logs.reduce((n, x) => n + (x.items?.length || 0), 0)}</strong><small>所有紀錄底下的項目</small></div>
        </section>
        <section className="records-section">
          <div className="section-heading"><div><h2>近期工作紀錄</h2><p>依日期排序，快速查看過去處理的工作。</p></div><button className="primary-btn" onClick={openNew}><Plus size={17}/>新增紀錄</button></div>
          <div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋標題、摘要或工作內容…" /><kbd>⌘ K</kbd></div>
          {busy && <div className="inline-loading"><LoaderCircle className="spin" size={17}/>資料處理中…</div>}
          <div className="record-list">
            {filtered.map((log, index) => <article className="record-card" key={log.id}>
              <div className={`record-date tone-${index % 3}`}><strong>{new Date(`${log.log_date}T00:00:00`).getDate()}</strong><span>{new Date(`${log.log_date}T00:00:00`).toLocaleDateString('zh-TW', { month: 'short' })}</span></div>
              <div className="record-body"><div className="record-title-row"><div><span className="record-day">{log.log_date}</span><h3>{log.title}</h3></div><div className="record-actions"><button className="icon-btn" title="編輯" onClick={() => openEdit(log)}><Pencil size={16}/></button><button className="icon-btn danger" title="刪除" onClick={() => deleteLog(log)}><Trash2 size={16}/></button></div></div>
                {log.summary && <p className="summary">{log.summary}</p>}
                <div className="item-stack">{(log.items || []).map(item => <div className="work-item" key={item.id}><span className="item-bullet"></span><span>{item.content}</span>{item.project_name && <em>{item.project_name}</em>}</div>)}</div>
                <div className="record-footer"><span>{log.items?.length || 0} 個工作項目</span></div>
              </div>
            </article>)}
            {!filtered.length && <div className="empty-state"><div className="empty-icon"><BookOpen size={25}/></div><h3>{search ? '找不到符合的紀錄' : '還沒有工作紀錄'}</h3><p>{search ? '試試其他關鍵字。' : '新增第一筆紀錄，開始累積你的工作資料庫。'}</p>{!search && <button className="primary-btn" onClick={openNew}><Plus size={17}/>新增第一筆紀錄</button>}</div>}
          </div>
        </section>
      </> : <section className="placeholder-page"><div className="placeholder-icon"><Settings2 size={27}/></div><h2>{navItems.find(x => x.id === active)?.label}</h2><p>這個區塊會在後續版本接上資料管理功能。</p><button className="text-btn" onClick={() => setActive('records')}>返回工作紀錄</button></section>}
    </main>

    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false) }}>
      <section className="modal-card">
        <div className="modal-header"><div><p className="eyebrow">WORK LOG</p><h2>{editing ? '編輯工作紀錄' : '新增工作紀錄'}</h2></div><button className="icon-btn" onClick={() => setModal(false)}><X size={19}/></button></div>
        <form onSubmit={saveLog} className="record-form">
          <div className="form-grid"><label>紀錄日期<input type="date" value={form.log_date} onChange={e => setForm({ ...form, log_date: e.target.value })} required /></label><label>工作標題<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：整理公文及郵寄文件" required /></label></div>
          <label>工作摘要<textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="簡單記錄這次工作的背景或結果…" rows="2"/></label>
          <div className="items-heading"><div><strong>工作項目</strong><small>一筆紀錄可以包含多個工作項目</small></div><button type="button" className="soft-btn" onClick={() => setForm({ ...form, items: [...form.items, { content: '', category_id: '', project_id: '' }] })}><Plus size={15}/>新增項目</button></div>
          {form.items.map((item, index) => <div className="item-editor" key={index}>
            <div className="item-editor-top"><span>項目 {index + 1}</span>{form.items.length > 1 && <button type="button" className="remove-btn" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}><X size={14}/>移除</button>}</div>
            <label>工作內容<input value={item.content} onChange={e => updateItem(index, 'content', e.target.value)} placeholder="輸入實際處理的工作內容…" /></label>
            <div className="form-grid"><label>工作分類<select value={item.category_id} onChange={e => updateItem(index, 'category_id', e.target.value)}><option value="">選擇分類（可留空）</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>專案<select value={item.project_id} onChange={e => updateItem(index, 'project_id', e.target.value)}><option value="">不指定專案</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
          </div>)}
          <div className="modal-footer"><button type="button" className="soft-btn" onClick={() => setModal(false)}>取消</button><button className="primary-btn" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}儲存紀錄</button></div>
        </form>
      </section>
    </div>}
  </div>
}

function SetupScreen() {
  return <main className="login-wrap"><section className="login-card setup-card"><div className="brand-mark"><Leaf size={25}/></div><p className="eyebrow">FIRST-TIME SETUP</p><h1>完成網站連線設定</h1><p className="muted">請先設定 Supabase 專案網址與 Publishable key。</p><ol><li>將專案根目錄的 <code>.env.example</code> 複製並改名為 <code>.env</code></li><li>填入 Supabase Project URL</li><li>填入 <code>sb_publishable_</code> 開頭的 Publishable key</li><li>重新啟動網站</li></ol><p className="tiny-note">請勿填入 service_role 或 Secret key。</p></section></main>
}

export default App