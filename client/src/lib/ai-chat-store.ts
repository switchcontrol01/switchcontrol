import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PersistedChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  imageDataUrl?: string;
  structured?: unknown;
}

interface AiChatStore {
  messages: PersistedChatMessage[];
  setMessages: (msgs: PersistedChatMessage[]) => void;
  clearMessages: () => void;
}

const MAX_STORED_MESSAGES = 60;

export const useAiChatStore = create<AiChatStore>()(
  persist(
    (set) => ({
      messages: [],
      setMessages: (messages) => set({
        messages: messages.slice(-MAX_STORED_MESSAGES),
      }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "sc-ai-chat-v1",
      partialize: (state) => ({
        messages: state.messages
          .filter(m => m.content && m.content.length > 0 && m.role !== "system")
          .map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }))
          .slice(-MAX_STORED_MESSAGES),
      }),
    }
  )
);
