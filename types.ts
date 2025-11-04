export type TabId = 'notepad' | 'image-tools' | 'settings';

export interface NoteVersion {
  timestamp: string;
  content: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  versions: NoteVersion[];
}

export interface ImageFile {
  id: string;
  name: string;
  src: string;
  file: File;
  size: number;
  type: string;
}

export type Theme = 'light' | 'dark' | 'auto';

export interface Settings {
  autosave: boolean;
  autosaveInterval: number;
  fontSize: number;
  theme: Theme;
  primaryColor: string;
  aiAssistant: boolean;
}

export enum AIAssistAction {
  GRAMMAR = 'grammar',
  SUMMARIZE = 'summarize',
  KEYWORDS = 'keywords',
  EXPAND = 'expand',
  SIMPLIFY = 'simplify',
}
