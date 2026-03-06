import React, { useState } from 'react';
import { Task } from '../types';
import { Trash2, Clock, MapPin, CheckCircle, Circle, Repeat, X, Check, BellRing, ChevronDown } from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (task: Task) => void;
}

const TaskList: React.FC<TaskListProps> = ({ tasks, onDelete, onToggle, onUpdate }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});

  const startEditing = (task: Task, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setEditingId(task.id);
    setEditForm(task);
  };

  const toInputFormat = (isoStr: string | null) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const pad = (n: number) => n < 10 ? '0'+n : n;
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  if (tasks.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center text-slate-500">
        <p className="text-sm font-medium tracking-widest uppercase">Matrix Empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {tasks.map((task) => {
        const isEditing = editingId === task.id;
        if (isEditing) {
            return (
                <div key={task.id} className="glass p-8 rounded-3xl border-2 border-blue-500 shadow-2xl space-y-6">
                    <div className="space-y-2">
                         <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Entry Content</label>
                         <textarea 
                            className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white focus:border-blue-500 outline-none resize-none transition-all"
                            value={editForm.description || ''}
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                            rows={2}
                            autoFocus
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="datetime-local" className="bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white" value={toInputFormat(editForm.dueDateTime || null)} onChange={e => setEditForm({...editForm, dueDateTime: new Date(e.target.value).toISOString()})} />
                        <select className="bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white" value={editForm.recurrence || ''} onChange={e => setEditForm({...editForm, recurrence: e.target.value || null})}>
                            <option value="">No Repeat</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setEditingId(null)} className="px-6 py-2 glass rounded-xl text-xs font-bold">CANCEL</button>
                        <button onClick={() => { onUpdate({...task, ...editForm} as Task); setEditingId(null); }} className="px-6 py-2 bg-blue-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-blue-600/20">SAVE MATRIX</button>
                    </div>
                </div>
            );
        }

        return (
            <div
              key={task.id}
              onClick={(e) => startEditing(task, e)}
              className={`glass-card glass p-6 rounded-2xl group cursor-pointer border-white/5 transition-all ${task.completed ? 'opacity-30' : ''}`}
            >
              <div className="flex items-start gap-4">
                <button onClick={(e) => { e.stopPropagation(); onToggle(task.id); }} className={`mt-1 transition-colors ${task.completed ? 'text-green-400' : 'text-slate-500 hover:text-blue-400'}`}>
                    {task.completed ? <CheckCircle size={24} /> : <Circle size={24} />}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-lg font-bold tracking-tight text-white ${task.completed ? 'line-through decoration-white/20' : ''}`}>{task.description}</p>
                    {task.id.length > 36 && (
                      <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-3 h-3 opacity-50" alt="Synced" title="Synced with Google Tasks" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {task.alarmTime && <span className="glass px-3 py-1.5 rounded-lg text-[10px] font-black text-blue-300 flex items-center gap-1.5 uppercase tracking-tighter"><BellRing size={10}/> {new Date(task.alarmTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                    {task.locationTrigger && <span className="glass px-3 py-1.5 rounded-lg text-[10px] font-black text-emerald-300 flex items-center gap-1.5 uppercase tracking-tighter"><MapPin size={10}/> {task.locationTrigger}</span>}
                    {task.recurrence && <span className="glass px-3 py-1.5 rounded-lg text-[10px] font-black text-purple-300 flex items-center gap-1.5 uppercase tracking-tighter"><Repeat size={10}/> {task.recurrence}</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={20}/></button>
              </div>
            </div>
        );
      })}
    </div>
  );
};

export default TaskList;