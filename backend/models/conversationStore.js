const conversations = new Map();

export function getConversationKey({ conversationId, mode }) {
  return `${mode}:${conversationId}`;
}

export function getConversationHistory({ conversationId, mode }) {
  const conversationKey = getConversationKey({ conversationId, mode });
  return conversations.get(conversationKey) || [];
}

export function setConversationHistory({ conversationId, mode, history }) {
  const conversationKey = getConversationKey({ conversationId, mode });
  conversations.set(conversationKey, history);
}

export function resetConversation({ conversationId, mode }) {
  const conversationKey = getConversationKey({ conversationId, mode });
  conversations.delete(conversationKey);
}
