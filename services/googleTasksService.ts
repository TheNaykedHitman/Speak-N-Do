import { Task } from '../types';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

// Helper to parse our custom metadata from the Notes field
// We store JSON in notes to keep alarm/location data synced
const parseNotes = (notes: string | undefined): Partial<Task> => {
  if (!notes) return {};
  try {
    // Look for a JSON block at the end of the notes
    const match = notes.match(/\{"appMeta":.*\}$/);
    if (match) {
      const meta = JSON.parse(match[0]);
      return meta.appMeta || {};
    }
  } catch (e) {
    console.warn("Failed to parse task metadata", e);
  }
  return {};
};

// Helper to serialize metadata into notes
const serializeNotes = (existingNotes: string | undefined, task: Task): string => {
  const meta = {
    appMeta: {
      alarmTime: task.alarmTime,
      locationTrigger: task.locationTrigger,
      recurrence: task.recurrence,
      createdAt: task.createdAt
    }
  };
  
  // Remove existing meta block if present to avoid duplication
  let cleanNotes = existingNotes ? existingNotes.replace(/\{"appMeta":.*\}$/, '').trim() : '';
  return `${cleanNotes}\n\n${JSON.stringify(meta)}`;
};

export const fetchGoogleTasks = async (accessToken: string): Promise<Task[]> => {
  try {
    const response = await fetch(`${TASKS_API_BASE}/lists/@default/tasks?showCompleted=true&showHidden=true`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch tasks');

    const data = await response.json();
    if (!data.items) return [];

    return data.items.map((gTask: any) => {
      const meta = parseNotes(gTask.notes);
      
      return {
        id: gTask.id, // Use Google's ID
        description: gTask.title,
        dueDateTime: gTask.due ? gTask.due : null,
        completed: gTask.status === 'completed',
        // Hydrate from metadata in notes, or fallbacks
        alarmTime: meta.alarmTime || null,
        locationTrigger: meta.locationTrigger || null,
        recurrence: meta.recurrence || null,
        createdAt: meta.createdAt || new Date().toISOString()
      };
    });
  } catch (error) {
    console.error("Google Tasks Fetch Error:", error);
    throw error;
  }
};

export const createGoogleTask = async (accessToken: string, task: Task): Promise<string | null> => {
  try {
    const body = {
      title: task.description,
      notes: serializeNotes('', task),
      due: task.dueDateTime // RFC 3339 format
    };

    const response = await fetch(`${TASKS_API_BASE}/lists/@default/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Failed to create task');
    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error("Google Tasks Create Error:", error);
    return null;
  }
};

export const updateGoogleTask = async (accessToken: string, task: Task): Promise<void> => {
  try {
    const body = {
        title: task.description,
        status: task.completed ? 'completed' : 'needsAction',
        notes: serializeNotes('', task), // This overwrites notes, ideally we'd fetch existing first but simple for now
        due: task.dueDateTime
    };

    await fetch(`${TASKS_API_BASE}/lists/@default/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error("Google Tasks Update Error:", error);
  }
};

export const deleteGoogleTask = async (accessToken: string, taskId: string): Promise<void> => {
  try {
    await fetch(`${TASKS_API_BASE}/lists/@default/tasks/${taskId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    console.error("Google Tasks Delete Error:", error);
  }
};