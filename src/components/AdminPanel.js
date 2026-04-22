import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

const TODAY = new Date().toISOString().split('T')[0];

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function shouldShowToday(task) {
  const now = new Date();
  const dow = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const month = now.getMonth() + 1;

  if (task.season === 'summer' && (month < 6 || month > 9)) return false;
  if (task.season === 'spring' && (month < 3 || month > 5)) return false;
  if (task.season === 'fall' && (month < 9 || month > 11)) return false;
  if (task.season === 'winter' && !(month === 12 || month <= 2)) return false;

  if (task.recurrence === 'daily') return true;

  if (task.recurrence === 'biweekly') {
    const start = new Date('2024-01-01');
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) % 2 === 0;
  }

  const days = task.recurrence ? task.recurrence.split(',') : [];
  return days.includes(dow);
}

async function uploadPhoto(file) {
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('task-photos')
    .upload(fileName, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('task-photos').getPublicUrl(fileName);
  return data.publicUrl;
}

const EMPTY_TASK = {
  title: '', description: '', category: 'bar', season: 'all',
  recurrence: 'daily', pic_required: false, is_active: true,
  due_by: 'anytime', task_notes: '', reference_photo_url: '',
  title_es: '', description_es: '', task_notes_es: '',
};

export default function AdminPanel({ onLogout }) {
  const [activeTab, setActiveTab] = useState('operations');
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [adhocTasks, setAdhocTasks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [newAdhoc, setNewAdhoc] = useState({ title: '', notes: '' });
  const [newTask, setNewTask] = useState({ ...EMPTY_TASK });
  const [newTaskRefFile, setNewTaskRefFile] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [editRefFile, setEditRefFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [approveTask, setApproveTask] = useState(null);

  const loadData = useCallback(async () => {
    const [{ data: t }, { data: e }, { data: a }, { data: s }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: true }),
      supabase.from('checklist_entries').select('*').gte('date', getYesterday()).order('created_at', { ascending: false }),
      supabase.from('adhoc_tasks').select('*').eq('date', TODAY).order('created_at', { ascending: false }),
      supabase.from('task_suggestions').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    ]);
    setTasks(t || []);
    setEntries(e || []);
    setAdhocTasks(a || []);
    setSuggestions(s || []);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ---- DAILY PROGRESS ----
  const todayTasks = tasks.filter(t => t.is_active && shouldShowToday(t));
  const todayEntries = entries.filter(e => e.date === TODAY);
  const completedIds = new Set(todayEntries.filter(e => e.completed).map(e => e.task_id));
  const missedTasks = tasks.filter(t => {
    const yEntries = entries.filter(e => e.date === getYesterday() && e.task_id === t.id);
    return t.is_active && shouldShowToday(t) && yEntries.length === 0;
  });

  const done = todayTasks.filter(t => completedIds.has(t.id)).length;
  const total = todayTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // ---- ADD ADHOC ----
  const handleAddAdhoc = async () => {
    if (!newAdhoc.title.trim()) return;
    await supabase.from('adhoc_tasks').insert({ ...newAdhoc, date: TODAY, completed: false, urgent: false });
    setNewAdhoc({ title: '', notes: '' });
    loadData();
  };

  const toggleAdhocUrgent = async (item) => {
    await supabase.from('adhoc_tasks').update({ urgent: !item.urgent }).eq('id', item.id);
    loadData();
  };

  const toggleAdhocDone = async (item) => {
    await supabase.from('adhoc_tasks').update({ completed: !item.completed }).eq('id', item.id);
    loadData();
  };

  // ---- ADD TASK ----
  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    setSaving(true);
    try {
      let refUrl = '';
      if (newTaskRefFile) refUrl = await uploadPhoto(newTaskRefFile);
      await supabase.from('tasks').insert({ ...newTask, reference_photo_url: refUrl });
      setNewTask({ ...EMPTY_TASK });
      setNewTaskRefFile(null);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  // ---- EDIT TASK ----
  const openEdit = (task) => {
    setEditTask({ ...task });
    setEditRefFile(null);
  };

  const handleEditSave = async () => {
    if (!editTask) return;
    setSaving(true);
    try {
      let refUrl = editTask.reference_photo_url || '';
      if (editRefFile) refUrl = await uploadPhoto(editRefFile);
      await supabase.from('tasks').update({ ...editTask, reference_photo_url: refUrl }).eq('id', editTask.id);
      setEditTask(null);
      setEditRefFile(null);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (task) => {
    await supabase.from('tasks').update({ is_active: !task.is_active }).eq('id', task.id);
    loadData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task permanently?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    loadData();
  };

  // ---- SUGGESTIONS ----
  const handleApprove = (sug) => {
    setApproveTask({
      title: sug.title, description: sug.description,
      category: sug.category || 'bar', season: 'all', recurrence: 'daily',
      pic_required: false, is_active: true, due_by: 'anytime', task_notes: '',
      reference_photo_url: '', _sugId: sug.id,
    });
  };

  const handleApproveConfirm = async () => {
    if (!approveTask) return;
    setSaving(true);
    try {
      const { _sugId, ...taskData } = approveTask;
      let refUrl = taskData.reference_photo_url || '';
      if (editRefFile) refUrl = await uploadPhoto(editRefFile);
      await supabase.from('tasks').insert({ ...taskData, reference_photo_url: refUrl });
      await supabase.from('task_suggestions').update({ status: 'approved' }).eq('id', _sugId);
      setApproveTask(null);
      setEditRefFile(null);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (id) => {
    await supabase.from('task_suggestions').update({ status: 'rejected' }).eq('id', id);
    loadData();
  };

  // ---- SUBMISSIONS ----
  const submissions = entries.filter(e => e.date === TODAY && e.completed);

  return (
    <div>
      <div className="panel-header">
        <h2>⚙️ Admin Panel</h2>
        <div className="header-right">
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${activeTab === 'operations' ? ' active' : ''}`} onClick={() => setActiveTab('operations')}>Operations</button>
        <button className={`tab-btn${activeTab === 'suggestions' ? ' active' : ''}`} onClick={() => setActiveTab('suggestions')}>
          Suggestions {suggestions.length > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.72rem', marginLeft: '4px' }}>{suggestions.length}</span>}
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'operations' && (
          <>
            <div className="admin-grid">
              {/* COL 1: Daily Progress */}
              <div className="admin-col">
                <h3>📋 Daily Task Progress</h3>
                <div className="progress-label">{done}/{total} tasks complete ({pct}%)</div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                {todayTasks.map(task => {
                  const isComplete = completedIds.has(task.id);
                  const isMissed = missedTasks.find(m => m.id === task.id);
                  return (
                    <div key={task.id} className={`task-row ${isComplete ? 'completed' : 'pending'}`}>
                      <span className="task-row-title">{task.title}</span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {isMissed && <span className="badge badge-orange">MISSED</span>}
                        {isComplete
                          ? <span className="badge badge-green">✓ Done</span>
                          : <span className="badge badge-red">Pending</span>}
                      </div>
                    </div>
                  );
                })}
                {todayTasks.length === 0 && <p className="empty-state">No tasks today</p>}
              </div>

              {/* COL 2: Ad Hoc Tasks */}
              <div className="admin-col">
                <h3>📌 Ad Hoc Tasks</h3>
                <div className="adhoc-form">
                  <input
                    placeholder="Task title"
                    value={newAdhoc.title}
                    onChange={e => setNewAdhoc(p => ({ ...p, title: e.target.value }))}
                  />
                  <input
                    placeholder="Admin notes (optional)"
                    value={newAdhoc.notes}
                    onChange={e => setNewAdhoc(p => ({ ...p, notes: e.target.value }))}
                  />
                  <button className="btn btn-primary btn-full" onClick={handleAddAdhoc}>+ Add Task</button>
                </div>
                {adhocTasks.length === 0 && <p className="empty-state">No ad hoc tasks today</p>}
                {adhocTasks.map(item => (
                  <div key={item.id} className={`adhoc-item${item.urgent ? ' urgent' : ''}${item.completed ? ' done' : ''}`}>
                    <div className="adhoc-item-header">
                      <span className="adhoc-item-title">{item.title}</span>
                      {item.urgent && <span className="badge badge-red">URGENT</span>}
                      {item.completed && <span className="badge badge-green">Done</span>}
                    </div>
                    {item.notes && <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '4px' }}>{item.notes}</div>}
                    <div className="adhoc-item-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => toggleAdhocUrgent(item)}>
                        {item.urgent ? 'Un-urgent' : '🚨 Urgent'}
                      </button>
                      <button className="btn btn-sm btn-success" onClick={() => toggleAdhocDone(item)}>
                        {item.completed ? 'Reopen' : '✓ Done'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* COL 3: Submissions */}
              <div className="admin-col">
                <h3>📷 Submissions Today</h3>
                {submissions.length === 0 && <p className="empty-state">No completions yet</p>}
                {submissions.map(e => {
                  const task = tasks.find(t => t.id === e.task_id);
                  return (
                    <div key={e.id} className="submission-item">
                      <div className="submission-title">{task ? task.title : 'Unknown Task'}</div>
                      <div className="submission-meta">{new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      {e.notes && <div className="submission-notes">{e.notes}</div>}
                      {e.photo_url && (
                        <a href={e.photo_url} target="_blank" rel="noreferrer">
                          <img src={e.photo_url} alt="submission" className="submission-photo" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task Management */}
            <div className="task-mgmt">
              <h3>🛠 Task Management</h3>
              <div className="add-task-form">
                <h4>Add New Task</h4>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Title *</label>
                    <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title" />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))}>
                      <option value="bar">Bar</option>
                      <option value="building">Building</option>
                      <option value="repair">Repair</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Season</label>
                    <select value={newTask.season} onChange={e => setNewTask(p => ({ ...p, season: e.target.value }))}>
                      <option value="all">All Year</option>
                      <option value="spring">Spring</option>
                      <option value="summer">Summer</option>
                      <option value="fall">Fall</option>
                      <option value="winter">Winter</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Recurrence</label>
                    <select value={newTask.recurrence} onChange={e => setNewTask(p => ({ ...p, recurrence: e.target.value }))}>
                      <option value="daily">Daily</option>
                      <option value="monday">Monday</option>
                      <option value="tuesday">Tuesday</option>
                      <option value="wednesday">Wednesday</option>
                      <option value="thursday">Thursday</option>
                      <option value="friday">Friday</option>
                      <option value="monday,friday">Mon + Fri</option>
                      <option value="biweekly">Biweekly</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Due By</label>
                    <select value={newTask.due_by} onChange={e => setNewTask(p => ({ ...p, due_by: e.target.value }))}>
                      <option value="anytime">Anytime</option>
                      <option value="morning">Morning</option>
                      <option value="afternoon">Afternoon</option>
                      <option value="end of day">End of Day</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label>Description</label>
                  <textarea rows={2} value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
                </div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label>Task Notes (shown to worker)</label>
                  <textarea rows={2} value={newTask.task_notes} onChange={e => setNewTask(p => ({ ...p, task_notes: e.target.value }))} placeholder="Notes visible to worker on their card" />
                </div>
                <div style={{ borderTop: '1px dashed #e0e0e0', margin: '10px 0 10px', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#888', marginBottom: '8px' }}>🌐 Spanish Translation (optional — shown to worker when ES is selected)</div>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label>Title (ES)</label>
                    <input value={newTask.title_es} onChange={e => setNewTask(p => ({ ...p, title_es: e.target.value }))} placeholder="Título en español" />
                  </div>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label>Description (ES)</label>
                    <textarea rows={2} value={newTask.description_es} onChange={e => setNewTask(p => ({ ...p, description_es: e.target.value }))} placeholder="Descripción en español" />
                  </div>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label>Task Notes (ES)</label>
                    <textarea rows={2} value={newTask.task_notes_es} onChange={e => setNewTask(p => ({ ...p, task_notes_es: e.target.value }))} placeholder="Notas en español" />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label>Reference Photo (optional)</label>
                  <input type="file" accept="image/*" onChange={e => setNewTaskRefFile(e.target.files[0] || null)} />
                  {newTaskRefFile && <img src={URL.createObjectURL(newTaskRefFile)} alt="preview" className="ref-photo-preview" />}
                </div>
                <div className="form-check">
                  <input type="checkbox" id="pic_req_new" checked={newTask.pic_required} onChange={e => setNewTask(p => ({ ...p, pic_required: e.target.checked }))} />
                  <label htmlFor="pic_req_new">Photo required from worker</label>
                </div>
                <button className="btn btn-primary" onClick={handleAddTask} disabled={saving}>
                  {saving ? 'Saving...' : '+ Add Task'}
                </button>
              </div>

              <div className="task-list-grid">
                {tasks.map(task => (
                  <div key={task.id} className={`task-card-admin${!task.is_active ? ' inactive' : ''}`}>
                    <div className="task-card-admin-header">
                      <span className="task-card-admin-title">{task.title}</span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <span className="badge badge-blue">{task.category}</span>
                        {!task.is_active && <span className="badge badge-gray">Inactive</span>}
                      </div>
                    </div>
                    <div className="task-card-admin-meta">
                      {task.recurrence} · {task.season} · Due: {task.due_by}
                      {task.pic_required && ' · 📷 Photo req'}
                    </div>
                    {task.description && <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '4px' }}>{task.description}</div>}
                    {task.reference_photo_url && (
                      <img src={task.reference_photo_url} alt="reference" className="ref-photo-preview" />
                    )}
                    <div className="task-card-admin-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(task)}>Edit</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleDeactivate(task)}>
                        {task.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(task.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'suggestions' && (
          <div>
            <h3 style={{ marginBottom: '14px', color: '#1a1a2e' }}>Worker Suggestions</h3>
            {suggestions.length === 0 && <p className="empty-state">No pending suggestions</p>}
            {suggestions.map(sug => (
              <div key={sug.id} className="suggestion-item">
                <div className="suggestion-header">
                  <span className="suggestion-title">{sug.title}</span>
                  <span className={`badge ${sug.urgency === 'urgent' ? 'badge-red' : 'badge-gray'}`}>{sug.urgency}</span>
                  <span className="badge badge-blue">{sug.category}</span>
                </div>
                {sug.description && <div className="suggestion-desc">{sug.description}</div>}
                <div className="suggestion-meta">{new Date(sug.created_at).toLocaleDateString()}</div>
                <div className="suggestion-actions">
                  <button className="btn btn-sm btn-success" onClick={() => handleApprove(sug)}>✓ Approve</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleReject(sug.id)}>✗ Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Task Modal */}
      {editTask && (
        <TaskModal
          task={editTask}
          onChange={setEditTask}
          refFile={editRefFile}
          onRefFile={setEditRefFile}
          onSave={handleEditSave}
          onClose={() => { setEditTask(null); setEditRefFile(null); }}
          saving={saving}
          title="Edit Task"
        />
      )}

      {/* Approve Suggestion Modal */}
      {approveTask && (
        <TaskModal
          task={approveTask}
          onChange={setApproveTask}
          refFile={editRefFile}
          onRefFile={setEditRefFile}
          onSave={handleApproveConfirm}
          onClose={() => { setApproveTask(null); setEditRefFile(null); }}
          saving={saving}
          title="Approve as New Task"
        />
      )}
    </div>
  );
}

function TaskModal({ task, onChange, refFile, onRefFile, onSave, onClose, saving, title }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{title}</h3>
        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label>Title</label>
          <input value={task.title} onChange={e => onChange(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Category</label>
            <select value={task.category} onChange={e => onChange(p => ({ ...p, category: e.target.value }))}>
              <option value="bar">Bar</option>
              <option value="building">Building</option>
              <option value="repair">Repair</option>
            </select>
          </div>
          <div className="form-group">
            <label>Season</label>
            <select value={task.season} onChange={e => onChange(p => ({ ...p, season: e.target.value }))}>
              <option value="all">All Year</option>
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
              <option value="fall">Fall</option>
              <option value="winter">Winter</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Recurrence</label>
            <select value={task.recurrence} onChange={e => onChange(p => ({ ...p, recurrence: e.target.value }))}>
              <option value="daily">Daily</option>
              <option value="monday">Monday</option>
              <option value="tuesday">Tuesday</option>
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
              <option value="monday,friday">Mon + Fri</option>
              <option value="biweekly">Biweekly</option>
            </select>
          </div>
          <div className="form-group">
            <label>Due By</label>
            <select value={task.due_by} onChange={e => onChange(p => ({ ...p, due_by: e.target.value }))}>
              <option value="anytime">Anytime</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="end of day">End of Day</option>
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label>Description</label>
          <textarea rows={2} value={task.description || ''} onChange={e => onChange(p => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label>Task Notes (shown to worker)</label>
          <textarea rows={2} value={task.task_notes || ''} onChange={e => onChange(p => ({ ...p, task_notes: e.target.value }))} />
        </div>
        <div style={{ borderTop: '1px dashed #e0e0e0', margin: '10px 0 10px', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#888', marginBottom: '8px' }}>🌐 Spanish Translation (optional)</div>
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>Title (ES)</label>
            <input value={task.title_es || ''} onChange={e => onChange(p => ({ ...p, title_es: e.target.value }))} placeholder="Título en español" />
          </div>
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>Description (ES)</label>
            <textarea rows={2} value={task.description_es || ''} onChange={e => onChange(p => ({ ...p, description_es: e.target.value }))} placeholder="Descripción en español" />
          </div>
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label>Task Notes (ES)</label>
            <textarea rows={2} value={task.task_notes_es || ''} onChange={e => onChange(p => ({ ...p, task_notes_es: e.target.value }))} placeholder="Notas en español" />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label>Reference Photo (optional)</label>
          {task.reference_photo_url && !refFile && (
            <div style={{ marginBottom: '6px' }}>
              <img src={task.reference_photo_url} alt="current reference" className="ref-photo-preview" />
              <div style={{ fontSize: '0.78rem', color: '#777', marginTop: '2px' }}>Current photo — upload new to replace</div>
            </div>
          )}
          <input type="file" accept="image/*" onChange={e => onRefFile(e.target.files[0] || null)} />
          {refFile && <img src={URL.createObjectURL(refFile)} alt="new preview" className="ref-photo-preview" />}
        </div>
        <div className="form-check" style={{ marginBottom: '8px' }}>
          <input type="checkbox" id="pic_req_edit" checked={!!task.pic_required} onChange={e => onChange(p => ({ ...p, pic_required: e.target.checked }))} />
          <label htmlFor="pic_req_edit">Photo required from worker</label>
        </div>
        <div className="form-check" style={{ marginBottom: '12px' }}>
          <input type="checkbox" id="active_edit" checked={!!task.is_active} onChange={e => onChange(p => ({ ...p, is_active: e.target.checked }))} />
          <label htmlFor="active_edit">Active</label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
