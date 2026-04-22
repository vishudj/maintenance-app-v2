import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

const TODAY = new Date().toISOString().split('T')[0];

const T = {
  en: {
    title: '🔧 Worker Panel',
    missed: 'Missed Tasks',
    bar: 'Bar',
    building: 'Building',
    repair: 'Repair & Maintenance',
    adhoc: 'Ad Hoc Tasks',
    suggest: 'Suggest a Task',
    sugTitle: 'Task Title',
    sugDesc: 'Description',
    sugCat: 'Category',
    sugUrgency: 'Urgency',
    sugSubmit: 'Submit Suggestion',
    sugSuccess: '✓ Suggestion submitted! Thank you.',
    notesPlaceholder: 'Add notes...',
    notesRequired: 'Notes required',
    photoRequired: 'Photo required',
    done: 'Mark Done',
    addPhoto: '📷 Add Photo',
    dueBy: 'Due:',
    refPhoto: '📎 Admin Reference Photo',
    adminNotes: '📋 Note:',
    noTasks: 'No tasks here today',
  },
  es: {
    title: '🔧 Panel de Trabajador',
    missed: 'Tareas Perdidas',
    bar: 'Bar',
    building: 'Edificio',
    repair: 'Reparación y Mantenimiento',
    adhoc: 'Tareas Ad Hoc',
    suggest: 'Sugerir una Tarea',
    sugTitle: 'Título de la Tarea',
    sugDesc: 'Descripción',
    sugCat: 'Categoría',
    sugUrgency: 'Urgencia',
    sugSubmit: 'Enviar Sugerencia',
    sugSuccess: '✓ ¡Sugerencia enviada! Gracias.',
    notesPlaceholder: 'Agregar notas...',
    notesRequired: 'Notas requeridas',
    photoRequired: 'Foto requerida',
    done: 'Marcar Hecho',
    addPhoto: '📷 Agregar Foto',
    dueBy: 'Para:',
    refPhoto: '📎 Foto de Referencia del Admin',
    adminNotes: '📋 Nota:',
    noTasks: 'No hay tareas hoy',
  },
};

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

export default function WorkerPanel({ onLogout }) {
  const [lang, setLang] = useState('en');
  const [activeTab, setActiveTab] = useState('bar');
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [adhocTasks, setAdhocTasks] = useState([]);
  const [missedTasks, setMissedTasks] = useState([]);
  // Per-task state: { [taskId]: { notes, photoFile, photoUrl, submitting } }
  const [taskState, setTaskState] = useState({});
  // Per-adhoc state
  const [adhocState, setAdhocState] = useState({});
  const [suggest, setSuggest] = useState({ title: '', description: '', category: 'bar', urgency: 'normal' });
  const [suggestSuccess, setSuggestSuccess] = useState(false);
  const t = T[lang];

  const loadData = useCallback(async () => {
    const [{ data: taskData }, { data: entryData }, { data: adhocData }] = await Promise.all([
      supabase.from('tasks').select('*').eq('is_active', true).order('created_at', { ascending: true }),
      supabase.from('checklist_entries').select('*').gte('date', getYesterday()),
      supabase.from('adhoc_tasks').select('*').eq('date', TODAY).order('urgent', { ascending: false }),
    ]);

    const allTasks = taskData || [];
    const allEntries = entryData || [];

    const todayTasks = allTasks.filter(shouldShowToday);
    const yesterdayEntries = allEntries.filter(e => e.date === getYesterday());
    const missed = todayTasks.filter(task =>
      !yesterdayEntries.find(e => e.task_id === task.id)
    );

    setTasks(allTasks);
    setEntries(allEntries.filter(e => e.date === TODAY));
    setAdhocTasks(adhocData || []);
    setMissedTasks(missed);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getEntry = (taskId) => entries.find(e => e.task_id === taskId && e.completed);

  const getTaskState = (taskId) => taskState[taskId] || { notes: '', photoFile: null, photoUrl: null, submitting: false };

  const updateTaskState = (taskId, update) => {
    setTaskState(prev => ({ ...prev, [taskId]: { ...getTaskState(taskId), ...update } }));
  };

  const canSubmit = (task) => {
    const s = getTaskState(task.id);
    if (getEntry(task.id)) return false;
    if (!s.notes.trim()) return false;
    if (task.pic_required && !s.photoFile && !s.photoUrl) return false;
    return true;
  };

  const handleDone = async (task) => {
    const s = getTaskState(task.id);
    updateTaskState(task.id, { submitting: true });
    try {
      let photoUrl = '';
      if (s.photoFile) photoUrl = await uploadPhoto(s.photoFile);
      await supabase.from('checklist_entries').insert({
        task_id: task.id,
        date: TODAY,
        completed: true,
        notes: s.notes,
        photo_url: photoUrl,
        missed: false,
      });
      loadData();
    } finally {
      updateTaskState(task.id, { submitting: false });
    }
  };

  const handlePhotoChange = (taskId, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateTaskState(taskId, { photoFile: file, photoUrl: url });
  };

  // Adhoc
  const getAdhocState = (id) => adhocState[id] || { notes: '', submitting: false };
  const updateAdhocState = (id, update) => {
    setAdhocState(prev => ({ ...prev, [id]: { ...getAdhocState(id), ...update } }));
  };

  const handleAdhocDone = async (item) => {
    const s = getAdhocState(item.id);
    updateAdhocState(item.id, { submitting: true });
    try {
      await supabase.from('adhoc_tasks').update({ completed: true, admin_notes: s.notes }).eq('id', item.id);
      loadData();
    } finally {
      updateAdhocState(item.id, { submitting: false });
    }
  };

  // Suggest
  const handleSuggest = async () => {
    if (!suggest.title.trim()) return;
    await supabase.from('task_suggestions').insert({ ...suggest, status: 'pending' });
    setSuggest({ title: '', description: '', category: 'bar', urgency: 'normal' });
    setSuggestSuccess(true);
    setTimeout(() => setSuggestSuccess(false), 4000);
  };

  const taskTitle = (task) => (lang === 'es' && task.title_es) ? task.title_es : task.title;
  const taskDesc = (task) => (lang === 'es' && task.description_es) ? task.description_es : task.description;
  const taskNotes = (task) => (lang === 'es' && task.task_notes_es) ? task.task_notes_es : task.task_notes;

  const todayTasksByCategory = (cat) =>
    tasks.filter(task => task.is_active && shouldShowToday(task) && task.category === cat);

  const sortedTasks = (cat) => {
    const list = todayTasksByCategory(cat);
    const done = list.filter(t => getEntry(t.id));
    const notDone = list.filter(t => !getEntry(t.id));
    return [...notDone, ...done];
  };

  const TABS = [
    { key: 'bar', label: t.bar },
    { key: 'building', label: t.building },
    { key: 'repair', label: t.repair },
  ];

  return (
    <div>
      <div className="panel-header">
        <h2>{t.title}</h2>
        <div className="header-right">
          <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'es' : 'en')}>
            {lang === 'en' ? 'ES' : 'EN'}
          </button>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="worker-content">
        {/* Missed Tasks */}
        {missedTasks.length > 0 && (
          <>
            <div className="section-title" style={{ color: '#dc2626' }}>⚠️ {t.missed}</div>
            <div className="missed-section">
              {missedTasks.map(task => (
                <div key={task.id} className="worker-task-card missed-card">
                  <div className="worker-task-header">
                    <span className="worker-task-title">{taskTitle(task)}</span>
                    <span className="badge badge-red">MISSED</span>
                  </div>
                  <div className="worker-task-meta">{task.category} · {task.recurrence}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Category tabs */}
        <div className="category-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`cat-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Task list */}
        {sortedTasks(activeTab).length === 0 && (
          <p className="empty-state">{t.noTasks}</p>
        )}
        {sortedTasks(activeTab).map(task => {
          const entry = getEntry(task.id);
          const s = getTaskState(task.id);
          const isDone = !!entry;

          return (
            <div key={task.id} className={`worker-task-card${isDone ? ' done-card' : ''}`}>
              <div className="worker-task-header">
                <span className="worker-task-title">{taskTitle(task)}</span>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {task.due_by !== 'anytime' && (
                    <span className="badge badge-blue">{t.dueBy} {task.due_by}</span>
                  )}
                  {isDone && <span className="done-check">✓</span>}
                </div>
              </div>

              {taskDesc(task) && (
                <div className="worker-task-meta">{taskDesc(task)}</div>
              )}

              {taskNotes(task) && !isDone && (
                <div className="worker-task-notes-admin">
                  {t.adminNotes} {taskNotes(task)}
                </div>
              )}

              {/* FIX 2: Show reference photo if admin attached one */}
              {task.reference_photo_url && !isDone && (
                <div className="ref-photo-section">
                  <span className="ref-photo-label">{t.refPhoto}</span>
                  <img src={task.reference_photo_url} alt="admin reference" className="ref-photo-img" />
                </div>
              )}

              {!isDone && (
                <>
                  <div className="worker-task-input">
                    <textarea
                      placeholder={task.pic_required ? `${t.notesRequired} *` : t.notesPlaceholder}
                      value={s.notes}
                      onChange={e => updateTaskState(task.id, { notes: e.target.value })}
                    />
                  </div>

                  {task.pic_required && (
                    <label className="photo-upload-label">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={e => handlePhotoChange(task.id, e.target.files[0])}
                      />
                      {t.addPhoto} {task.pic_required && '*'}
                    </label>
                  )}

                  {s.photoUrl && (
                    <img src={s.photoUrl} alt="preview" className="photo-preview-thumb" />
                  )}

                  <button
                    className="done-btn"
                    disabled={!canSubmit(task) || s.submitting}
                    onClick={() => handleDone(task)}
                  >
                    {s.submitting ? '...' : t.done}
                  </button>
                </>
              )}

              {isDone && entry.notes && (
                <div style={{ fontSize: '0.83rem', color: '#555', marginTop: '4px' }}>
                  📝 {entry.notes}
                </div>
              )}
            </div>
          );
        })}

        {/* Ad Hoc Tasks */}
        <div className="section-title">{t.adhoc}</div>
        {adhocTasks.length === 0 && <p className="empty-state">{t.noTasks}</p>}
        {adhocTasks
          .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0))
          .map(item => {
            const s = getAdhocState(item.id);
            return (
              <div key={item.id} className={`worker-adhoc-card${item.urgent ? ' urgent-card' : ''}${item.completed ? ' done-card' : ''}`}>
                <div className="worker-adhoc-header">
                  <span className="worker-adhoc-title">{item.title}</span>
                  {item.urgent && <span className="badge badge-red">URGENT</span>}
                  {item.completed && <span className="done-check">✓</span>}
                </div>
                {item.admin_notes && !item.completed && (
                  <div className="admin-note">📋 {item.admin_notes}</div>
                )}
                {!item.completed && (
                  <>
                    <div className="worker-task-input">
                      <textarea
                        placeholder={t.notesPlaceholder}
                        value={s.notes}
                        onChange={e => updateAdhocState(item.id, { notes: e.target.value })}
                      />
                    </div>
                    <button
                      className="done-btn"
                      disabled={s.submitting}
                      onClick={() => handleAdhocDone(item)}
                    >
                      {s.submitting ? '...' : t.done}
                    </button>
                  </>
                )}
              </div>
            );
          })}

        {/* Suggest a Task */}
        <div className="section-title">{t.suggest}</div>
        <div className="suggest-form">
          <input
            placeholder={t.sugTitle + ' *'}
            value={suggest.title}
            onChange={e => setSuggest(p => ({ ...p, title: e.target.value }))}
          />
          <textarea
            rows={2}
            placeholder={t.sugDesc}
            value={suggest.description}
            onChange={e => setSuggest(p => ({ ...p, description: e.target.value }))}
          />
          <select value={suggest.category} onChange={e => setSuggest(p => ({ ...p, category: e.target.value }))}>
            <option value="bar">{t.bar}</option>
            <option value="building">{t.building}</option>
            <option value="repair">{t.repair}</option>
          </select>
          <select value={suggest.urgency} onChange={e => setSuggest(p => ({ ...p, urgency: e.target.value }))}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
          <button className="btn btn-primary btn-full" onClick={handleSuggest}>{t.sugSubmit}</button>
          {suggestSuccess && <div className="suggest-success">{t.sugSuccess}</div>}
        </div>
      </div>
    </div>
  );
}
