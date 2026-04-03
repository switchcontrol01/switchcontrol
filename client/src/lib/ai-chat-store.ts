import { create } from 'zustand';

export interface PersistedChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  imageDataUrl?: string;
}

interface AiChatStore {
  messages: PersistedChatMessage[];
  setMessages: (msgs: PersistedChatMessage[]) => void;
  clearMessages: () => void;
}

export const useAiChatStore = create<AiChatStore>((set) => ({
  messages: [],
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),
}));
