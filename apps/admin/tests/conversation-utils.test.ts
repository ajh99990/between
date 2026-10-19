import { describe, expect, it } from "vitest";
import { readableConversationMessages } from "../src/pages/conversation-utils";
import type { ConversationMessage } from "../src/types";

const message = (index: number, text: string, images: ConversationMessage["images"] = []): ConversationMessage => ({
  index,
  name: "朋友",
  role: "assistant",
  text,
  images,
});

describe("saved conversation reading", () => {
  it("omits empty opening placeholders and numbers visible messages without changing source IDs or text", () => {
    const original = [message(0, ""), message(1, " \n\t "), message(2, "  今天刚到家。\n\n先歇一会儿。  "), message(3, "嗯")];
    const before = structuredClone(original);
    const result = readableConversationMessages(original);
    expect(result.map((item) => [item.index, item.displayNumber])).toEqual([[2, 1], [3, 2]]);
    expect(result[0].text).toBe(original[2].text);
    expect(original).toEqual(before);
  });

  it("leaves an empty-only opening with no sections so the reader can show its empty state", () => {
    expect(readableConversationMessages([message(0, "")])).toEqual([]);
    expect(readableConversationMessages([message(0, "\n \t")])).toEqual([]);
  });

  it("retains supported images even when a message has no text", () => {
    const image = { id: "1-0", url: "data:image/png;base64,YQ==" };
    const result = readableConversationMessages([message(0, ""), message(1, "", [image])]);
    expect(result).toEqual([{ ...message(1, "", [image]), displayNumber: 1 }]);
  });
});
