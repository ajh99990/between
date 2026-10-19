import type { ConversationMessage } from "../types";

/** Hide empty opening placeholders without altering stored text or message IDs. */
export function readableConversationMessages(messages: readonly ConversationMessage[]) {
  return messages
    .filter((message) => message.text.trim().length > 0 || message.images.length > 0)
    .map((message, index) => ({ ...message, displayNumber: index + 1 }));
}
