import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { TabId, Note, Settings, ImageFile, Theme, NoteVersion, AIAssistAction } from './types';
import { runAIAssist } from './services/geminiService';
import { getStoreData, writeData, deleteData, writeImage } from './services/dbService';

// Fix: Add types for the Web Speech API to resolve TypeScript errors.
interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: (() => void) | null;
}

declare global {
    interface Window {
        SpeechRecognition: { new(): SpeechRecognition };
        webkitSpeechRecognition: { new(): SpeechRecognition };
    }
}

// --- ICONS (SVG Components) ---
const Icon = ({ path, className = "w-5 h-5" }: { path: string, className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d={path} />
    </svg>
);
const ICONS = {
    NOTEPAD: "M5.433 4.433a2.25 2.25 0 012.133-.433l8 4a2.25 2.25 0 010 3.998l-8 4a2.25 2.25 0 01-2.133-.433V4.433z",
    IMAGE: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    SETTINGS: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.48.398.665 1.043.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM12 15a3 3 0 100-6 3 3 0 000 6z",
    HELP: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z",
    SUN: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
    MOON: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z",
    PLUS: "M12 4.5v15m7.5-7.5h-15",
    TRASH: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
    SEARCH: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
    SAVE: "M9 12.75l3 3m0 0l3-3m-3 3v-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    MAGIC: "M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.47 2.118 2.25 2.25 0 01-2.47-2.118c0-.62.28-1.186.74-1.544a3 3 0 005.78-1.128 2.25 2.25 0 012.47-2.118 2.25 2.25 0 012.47 2.118c0 .62-.28 1.186-.74 1.544a3 3 0 00-5.78 1.128zM12.75 3.75a3 3 0 00-3 3v3.75a3 3 0 003 3h3.75a3 3 0 003-3v-3.75a3 3 0 00-3-3h-3.75z",
    VOLUME: "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z",
    MIC: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m12 0v-1.5a6 6 0 00-12 0v1.5m12 0v-1.5a6 6 0 00-12 0v1.5",
    HISTORY: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
    CLOSE: "M6 18L18 6M6 6l12 12",
    UPLOAD: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
    SPINNER: "M12 4.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15z"
};

// --- CUSTOM HOOKS ---
function useLocalStorage<T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });

    const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            console.error(error);
        }
    };
    return [storedValue, setValue];
}

// --- UTILITY FUNCTIONS ---
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const downloadCanvasAsImage = (canvas: HTMLCanvasElement, fileName: string, format = 'png', quality = 0.9) => {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL(`image/${format}`, quality);
    link.click();
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// --- UI COMPONENTS ---

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                        <Icon path={ICONS.CLOSE} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

// --- CORE APP ---

export default function App() {
    // --- STATE MANAGEMENT ---
    const [settings, setSettings] = useLocalStorage<Settings>('multi-tool-settings', {
        autosave: true, autosaveInterval: 10, fontSize: 16, theme: 'auto', primaryColor: '#4F46E5', aiAssistant: true
    });
    const [notes, setNotes] = useState<Note[]>([]);
    const [images, setImages] = useState<ImageFile[]>([]);
    
    const [activeTab, setActiveTab] = useState<TabId>('notepad');
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId]);

    const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
    }, []);

    // --- EFFECTS ---
    useEffect(() => {
        const loadData = async () => {
            try {
                const [dbNotes, dbImages] = await Promise.all([
                    getStoreData<Note>('notes'),
                    getStoreData<ImageFile>('images')
                ]);
                setNotes(dbNotes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
                setImages(dbImages);
            } catch (error) {
                console.error("Failed to load data from IndexedDB", error);
                showNotification("Could not load saved data.", "error");
            }
        };
        loadData();
    }, [showNotification]);


    useEffect(() => {
        const root = window.document.documentElement;
        let effectiveTheme = settings.theme;
        if (settings.theme === 'auto') {
            const hour = new Date().getHours();
            effectiveTheme = (hour < 6 || hour >= 18) ? 'dark' : 'light';
        }
        root.classList.toggle('dark', effectiveTheme === 'dark');
        root.style.setProperty('--primary-color', settings.primaryColor);
    }, [settings.theme, settings.primaryColor]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useEffect(() => {
        if (!activeNoteId && notes.length > 0) {
            setActiveNoteId(notes[0].id);
        }
        if (activeNoteId && !notes.find(n => n.id === activeNoteId)) {
            setActiveNoteId(notes.length > 0 ? notes[0].id : null);
        }
    }, [notes, activeNoteId]);
    
    // --- HANDLERS ---
    
    const handleCreateNewNote = async () => {
        const newNote: Note = {
            id: Date.now().toString(),
            title: 'Untitled Note',
            content: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            versions: []
        };
        await writeData('notes', newNote);
        setNotes(prev => [newNote, ...prev]);
        setActiveNoteId(newNote.id);
        showNotification('New note created');
    };

    const handleUpdateNote = useCallback(async (updatedNote: Partial<Note>) => {
        if (!activeNoteId) return;
        
        let noteToUpdate: Note | undefined;
        setNotes(prev => {
            const newNotes = prev.map(n => {
                if (n.id === activeNoteId) {
                    noteToUpdate = { ...n, ...updatedNote, updatedAt: new Date().toISOString() };
                    return noteToUpdate;
                }
                return n;
            });
            return newNotes;
        });

        if (noteToUpdate) {
            await writeData('notes', noteToUpdate);
        }
    }, [activeNoteId]);
    
    const handleSaveNote = useCallback(async () => {
        if (!activeNote) return;

        const version: NoteVersion = {
            timestamp: new Date().toISOString(),
            content: activeNote.content
        };

        const newVersions = [version, ...activeNote.versions].slice(0, 10);
        
        let noteToSave: Note | undefined;
        setNotes(prev => {
             const newNotes = prev.map(n => {
                if (n.id === activeNote.id) {
                    noteToSave = { ...n, versions: newVersions, updatedAt: new Date().toISOString() };
                    return noteToSave;
                }
                return n;
            });
            return newNotes;
        });
       
        if (noteToSave) {
            await writeData('notes', noteToSave);
        }
        showNotification("Note saved");
    }, [activeNote, setNotes, showNotification]);

    const handleDeleteNote = async (noteId: string) => {
        if (window.confirm('Are you sure you want to delete this note?')) {
            await deleteData('notes', noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
            showNotification('Note deleted');
        }
    };
    
    const handleImageUpload = async (files: FileList | null) => {
       if (!files) return;
       for (const file of Array.from(files)) {
           if (file.type.startsWith('image/')) {
               try {
                   const src = await blobToBase64(file);
                   const newImage: ImageFile = {
                       id: `${Date.now()}-${file.name}`,
                       name: file.name,
                       src,
                       file,
                       size: file.size,
                       type: file.type
                   };
                   await writeImage(newImage);
                   setImages(prev => [...prev, newImage]);
               } catch (error) {
                   console.error("Error processing image:", error);
                   showNotification("Failed to add image", "error");
               }
           }
       }
   };

   const handleImageDelete = async (imageId: string) => {
       await deleteData('images', imageId);
       setImages(prev => prev.filter(img => img.id !== imageId));
       showNotification('Image deleted');
   };

    return (
        <div className="flex h-screen overflow-hidden font-sans text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header 
                  title={activeTab === 'notepad' ? 'Notepad' : activeTab === 'image-tools' ? 'Image Tools' : 'Settings'} 
                  settings={settings}
                  setSettings={setSettings}
                />
                <main className="flex-1 overflow-y-auto p-2 sm:p-4">
                    {activeTab === 'notepad' && (
                        <NotepadView
                            notes={notes}
                            activeNote={activeNote}
                            setActiveNoteId={setActiveNoteId}
                            onUpdateNote={handleUpdateNote}
                            onSaveNote={handleSaveNote}
                            onDeleteNote={handleDeleteNote}
                            onCreateNote={handleCreateNewNote}
                            settings={settings}
                            showNotification={showNotification}
                        />
                    )}
                    {activeTab === 'image-tools' && <ImageToolsView images={images} onImageUpload={handleImageUpload} onImageDelete={handleImageDelete} showNotification={showNotification}/>}
                    {activeTab === 'settings' && <SettingsView settings={settings} setSettings={setSettings} showNotification={showNotification}/>}
                </main>
            </div>
            {notification && (
                <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'} transition-transform transform-gpu animate-bounce`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
}

// --- SUB-COMPONENTS & VIEWS ---

const Sidebar: React.FC<{ activeTab: TabId, setActiveTab: (tab: TabId) => void }> = ({ activeTab, setActiveTab }) => {
    const navItems: { id: TabId; name: string; icon: string }[] = [
        { id: 'notepad', name: 'Notepad', icon: ICONS.NOTEPAD },
        { id: 'image-tools', name: 'Image Tools', icon: ICONS.IMAGE },
        { id: 'settings', name: 'Settings', icon: ICONS.SETTINGS },
    ];

    return (
        <aside className="w-16 sm:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h1 className="text-xl font-bold text-[var(--primary-color)] hidden sm:block">Multi-Tool</h1>
            </div>
            <nav className="flex-1 p-2 space-y-2">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex items-center p-3 rounded-lg w-full text-left transition-colors ${
                            activeTab === item.id 
                            ? 'bg-indigo-100 dark:bg-indigo-900/50 text-[var(--primary-color)]' 
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Icon path={item.icon} className="w-6 h-6" />
                        <span className="ml-4 font-medium hidden sm:block">{item.name}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
};

const Header: React.FC<{ title: string, settings: Settings, setSettings: React.Dispatch<React.SetStateAction<Settings>> }> = ({ title, settings, setSettings }) => {
    const toggleTheme = () => {
        const themes: Theme[] = ['light', 'dark', 'auto'];
        const currentIndex = themes.indexOf(settings.theme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        setSettings(s => ({...s, theme: nextTheme}));
    }

    return (
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between flex-shrink-0">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                {settings.theme === 'dark' ? <Icon path={ICONS.SUN} /> : <Icon path={ICONS.MOON} />}
            </button>
        </header>
    );
};

const NotepadView: React.FC<{
    notes: Note[],
    activeNote: Note | null,
    setActiveNoteId: (id: string | null) => void,
    onUpdateNote: (updatedNote: Partial<Note>) => void,
    onSaveNote: () => void,
    onDeleteNote: (id: string) => void,
    onCreateNote: () => void,
    settings: Settings,
    showNotification: (msg: string, type?: 'success' | 'error') => void,
}> = (props) => {
    const {notes, activeNote, setActiveNoteId, onUpdateNote, onSaveNote, onDeleteNote, onCreateNote, settings, showNotification} = props;
    const editorRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [isAiModalOpen, setAiModalOpen] = useState(false);
    const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);

    const [isListening, setIsListening] = useState(false);
    const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
    
    useEffect(() => {
        if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            console.warn("Speech Recognition not supported by this browser.");
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript && editorRef.current) {
                editorRef.current.focus();
                document.execCommand('insertText', false, finalTranscript);
            }
        };
        recognition.onerror = (event) => {
            showNotification(`Speech recognition error: ${event.error}`, 'error');
            setIsListening(false);
        };
        recognition.onend = () => {
            if (isListening) recognition.start();
        };
        
        speechRecognitionRef.current = recognition;
    }, [showNotification, isListening]);

    const toggleListening = () => {
        if (!speechRecognitionRef.current) return;
        if (isListening) {
            speechRecognitionRef.current.stop();
            setIsListening(false);
        } else {
            speechRecognitionRef.current.start();
            setIsListening(true);
        }
    };
    
    const handleTextToSpeech = () => {
        if (!activeNote || !activeNote.content) {
            showNotification("Nothing to speak.", "error");
            return;
        }
        const text = new DOMParser().parseFromString(activeNote.content, "text/html").body.textContent || "";
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    };

    const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
        onUpdateNote({ content: e.currentTarget.innerHTML });
    };

    const filteredNotes = useMemo(() => {
        return notes.filter(note => note.title.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [notes, searchTerm]);
    
    return (
        <div className="flex flex-col md:flex-row h-full gap-4">
            <div className="w-full md:w-1/3 lg:w-1/4 bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-col">
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-medium">Notes</h3>
                        <button onClick={onCreateNote} className="p-1 rounded-full text-[var(--primary-color)] hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Icon path={ICONS.PLUS} />
                        </button>
                    </div>
                    <div className="relative">
                        <input 
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2 pl-8 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                        />
                        <Icon path={ICONS.SEARCH} className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {filteredNotes.map(note => (
                        <div 
                            key={note.id}
                            onClick={() => setActiveNoteId(note.id)}
                            className={`p-3 rounded-lg cursor-pointer transition-colors border-l-4 ${
                                note.id === activeNote?.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-[var(--primary-color)]' : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <h4 className="font-medium truncate pr-2">{note.title}</h4>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }} className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50">
                                    <Icon path={ICONS.TRASH} className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(note.updatedAt)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {activeNote ? (
                <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <input 
                            type="text" 
                            value={activeNote.title}
                            onChange={(e) => onUpdateNote({ title: e.target.value })}
                            placeholder="Note Title" 
                            className="w-full text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0"
                        />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4" style={{fontSize: `${settings.fontSize}px`}}>
                         <div 
                            ref={editorRef}
                            contentEditable="true" 
                            onInput={handleEditorInput}
                            dangerouslySetInnerHTML={{ __html: activeNote.content }}
                            className="min-h-full focus:outline-none prose dark:prose-invert max-w-none"
                        ></div>
                    </div>
                    
                    <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <div className="text-sm text-gray-500 dark:text-gray-400 px-2">
                           Last saved: {formatDate(activeNote.updatedAt)}
                        </div>
                        <div className="flex items-center space-x-2">
                             <button onClick={handleTextToSpeech} title="Text to Speech" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><Icon path={ICONS.VOLUME} /></button>
                             <button onClick={toggleListening} title="Speech to Text" className={`p-2 rounded ${isListening ? 'bg-red-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}><Icon path={ICONS.MIC} /></button>
                             <button onClick={() => setAiModalOpen(true)} title="AI Assistant" className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><Icon path={ICONS.MAGIC} /></button>
                            <button onClick={() => setHistoryModalOpen(true)} className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded flex items-center gap-1"><Icon path={ICONS.HISTORY} className="w-4 h-4"/> History</button>
                            <button onClick={onSaveNote} className="px-4 py-2 text-sm bg-[var(--primary-color)] hover:opacity-90 text-white rounded flex items-center gap-1"><Icon path={ICONS.SAVE} className="w-4 h-4"/> Save</button>
                        </div>
                    </div>
                </div>
            ) : (
                 <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow text-gray-500">
                    <Icon path={ICONS.NOTEPAD} className="w-16 h-16 mb-4"/>
                    <h3 className="text-xl">Select a note or create a new one</h3>
                </div>
            )}
        </div>
    );
};


const ImageToolsView: React.FC<{
    images: ImageFile[],
    onImageUpload: (files: FileList | null) => void,
    onImageDelete: (id: string) => void,
    showNotification: (msg: string, type?: 'success' | 'error') => void,
}> = ({ images, onImageUpload, onImageDelete, showNotification }) => {
    
    return (
        <div className="flex flex-col md:flex-row h-full gap-4">
            <div className="w-full md:w-1/3 lg:w-1/4 bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-col">
                <h3 className="font-medium mb-4">Image Tools (coming soon)</h3>
                <input type="file" multiple accept="image/*" onChange={(e) => onImageUpload(e.target.files)} className="mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100" />
                <div className="flex-1 overflow-y-auto space-y-2">
                    {images.map(img => (
                        <div key={img.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                            <div className="flex items-center gap-2 truncate">
                                <img src={img.src} alt={img.name} className="w-10 h-10 object-cover rounded flex-shrink-0" />
                                <div className="truncate">
                                    <p className="text-sm font-medium truncate">{img.name}</p>
                                    <p className="text-xs text-gray-500">{formatFileSize(img.size)}</p>
                                </div>
                            </div>
                            <button onClick={() => onImageDelete(img.id)} className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 flex-shrink-0">
                                <Icon path={ICONS.TRASH} className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-gray-500">
                <div className="text-center">
                    <Icon path={ICONS.IMAGE} className="w-16 h-16 mx-auto mb-4"/>
                    <h3 className="text-xl">Image Processing Canvas</h3>
                    <p>Select an image to begin editing.</p>
                </div>
            </div>
        </div>
    );
};

const ToggleSwitch: React.FC<{checked: boolean, onChange: (checked: boolean) => void}> = ({ checked, onChange }) => {
    return (
        <label className="relative inline-flex items-center cursor-pointer">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--primary-color)]"></div>
        </label>
    );
};

const SettingsView: React.FC<{
    settings: Settings,
    setSettings: React.Dispatch<React.SetStateAction<Settings>>,
    showNotification: (msg: string, type?: 'success' | 'error') => void,
}> = ({ settings, setSettings, showNotification }) => {
    
    const handleSave = () => {
        showNotification('Settings saved!');
    };

    return (
        <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-2xl font-semibold mb-6">Settings</h3>
            <div className="space-y-8">
                <div>
                    <h4 className="font-medium mb-3 text-lg">General</h4>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between">
                            <span>Autosave Notes</span>
                            <ToggleSwitch
                                checked={settings.autosave}
                                onChange={checked => setSettings(s => ({ ...s, autosave: checked }))}
                            />
                        </label>
                        <div>
                            <label className="block mb-1">Editor Font Size: {settings.fontSize}px</label>
                            <input type="range" min="12" max="24" value={settings.fontSize} onChange={e => setSettings(s => ({...s, fontSize: Number(e.target.value)}))} className="w-full" />
                        </div>
                    </div>
                </div>

                <div>
                    <h4 className="font-medium mb-3 text-lg">Theme</h4>
                    <div className="space-y-4">
                         <div>
                            <label className="block mb-2">Mode</label>
                            <div className="flex space-x-4">
                                {(['light', 'dark', 'auto'] as Theme[]).map(theme => (
                                    <label key={theme} className="flex items-center">
                                        <input type="radio" name="theme-mode" value={theme} checked={settings.theme === theme} onChange={() => setSettings(s => ({...s, theme}))} className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                        <span className="ml-2 capitalize">{theme}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block mb-1">Primary Color</label>
                            <input type="color" value={settings.primaryColor} onChange={e => setSettings(s => ({...s, primaryColor: e.target.value}))} />
                        </div>
                    </div>
                </div>

                <div>
                     <h4 className="font-medium mb-3 text-lg">AI Assistant</h4>
                     <label className="flex items-center justify-between">
                        <span>Enable AI Assistant</span>
                        <ToggleSwitch
                            checked={settings.aiAssistant}
                            onChange={checked => setSettings(s => ({ ...s, aiAssistant: checked }))}
                        />
                    </label>
                    <p className="text-sm text-gray-500 mt-2">AI features require a valid Gemini API key set as an environment variable (API_KEY).</p>
                </div>
                
                 <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={handleSave} className="px-4 py-2 bg-[var(--primary-color)] text-white rounded-lg hover:opacity-90">Save Settings</button>
                </div>
            </div>
        </div>
    );
};