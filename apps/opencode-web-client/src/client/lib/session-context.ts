import type { NormalizedMessage } from '../../shared/types.js';
import { useStore } from '../runtime/store.js';
import { api } from './api-client.js';
import { mergeSessionMessages, sortSessionsForSidebar } from './session-meta.js';

export async function reopenWorkspaceSessionContext(workspaceId: string, sessionId: string): Promise<NormalizedMessage[]> {
  const { setActiveSession, setMessages, setSessions } = useStore.getState();

  setActiveSession(workspaceId, sessionId);
  const messages = await api.listMessages(workspaceId, sessionId);
  setMessages(workspaceId, sessionId, messages);

  const currentSessions = useStore.getState().sessionsByWorkspace[workspaceId] ?? [];
  setSessions(workspaceId, sortSessionsForSidebar(mergeSessionMessages(currentSessions, sessionId, messages)));

  return messages;
}
