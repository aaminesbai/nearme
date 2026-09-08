export interface ConversationPresence {
  userId: string;
  activeConversation?: string;
}
export function needsPush(
  recipientId: string,
  conversationId: string,
  sessions: Iterable<ConversationPresence>,
): boolean {
  for (const session of sessions) {
    if (session.userId === recipientId && session.activeConversation === conversationId)
      return false;
  }
  return true;
}
