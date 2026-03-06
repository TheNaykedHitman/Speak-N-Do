export interface Task {
  id: string;
  description: string;
  dueDateTime: string | null; // ISO String
  alarmTime: string | null; // ISO String
  locationTrigger: string | null;
  recurrence: string | null; // 'daily', 'weekly', 'weekdays', 'monthly'
  completed: boolean;
  createdAt: string;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioConfig {
  sampleRate: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SavedLocations {
  home?: Coordinates;
  work?: Coordinates;
}
