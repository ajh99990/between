import { Button, DocumentReader, Drawer, Empty, ErrorNotice, Spinner, useUiEnabled } from "@between/ui";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { useAdmin } from "../state";
import type { Conversation, ConversationTranscript } from "../types";
import { readableConversationMessages } from "./conversation-utils";

export function ConversationReader({
  conversation,
  open,
  onClose,
}: {
  conversation: (Conversation & { userId: string }) | null;
  open: boolean;
  onClose: () => void;
}) {
  const enabled = useUiEnabled();
  const { state } = useAdmin();
  const identity = conversation ? `${conversation.userId}:${conversation.id}` : "";
  const available =
    !!conversation &&
    state.users.some(
      (user) =>
        user.id === conversation.userId && user.conversations.some((item) => item.id === conversation.id),
    );
  const [loaded, setLoaded] = useState<{ identity: string; value: ConversationTranscript } | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    setQuery("");
  }, [identity]);

  useEffect(() => {
    const generation = ++request.current;
    if (!enabled || !available) {
      setLoaded(null);
      setError("");
      setLoading(false);
      return;
    }
    if (!open || !conversation) return;
    let alive = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ userId: conversation.userId, conversation: conversation.id });
    void api<ConversationTranscript>(`/conversation?${params}`)
      .then((value) => {
        if (alive && request.current === generation) setLoaded({ identity, value });
      })
      .catch((failure: unknown) => {
        if (!alive || request.current !== generation) return;
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) setLoaded(null);
        setError(failure instanceof Error ? failure.message : "读取聊天记录失败，请重试。");
      })
      .finally(() => {
        if (alive && request.current === generation) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [identity, attempt, open, enabled, available, conversation]);

  // Keep the last ordinary close frame for shared Drawer exit motion. Sensitive
  // data disappears immediately on expiry/removal; no transition retains it.
  const transcript = enabled && available && loaded?.identity === identity ? loaded.value : null;
  return (
    <Drawer
      open={open && enabled}
      title={conversation?.title || "聊天记录"}
      description={conversation ? `与 ${conversation.name} 的聊天记录` : undefined}
      size="lg"
      className="conversation-reader-drawer"
      onClose={onClose}
      footer={
        <>
          {transcript?.active && <span className="muted">正在生成；完成后刷新查看本轮记录</span>}
          <Button
            variant="secondary"
            disabled={loading || !available}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {loading ? "读取中…" : "刷新记录"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            关闭记录
          </Button>
        </>
      }
    >
      {enabled && (
        <div className="conversation-reader" aria-busy={loading}>
          {!available ? (
            <Empty icon="sessions" title="会话已删除或不可访问" description="关闭后刷新会话列表。" />
          ) : (
            <>
              {error && <ErrorNotice>{error}</ErrorNotice>}
              {loading && !transcript && (
                <div className="conversation-loading" role="status">
                  <Spinner />
                  正在读取聊天记录…
                </div>
              )}
              {transcript && (
                <DocumentReader
                  label="聊天记录"
                  searchLabel="在聊天记录中查找"
                  clearSearchLabel="清空聊天查找"
                  query={query}
                  onQueryChange={setQuery}
                  showOutline={false}
                  emptyTitle="还没有消息"
                  sections={readableConversationMessages(transcript.messages).map((item) => ({
                    id: `message-${item.index}`,
                    title: item.name || (item.role === "user" ? "用户" : transcript.character),
                    meta: `第 ${item.displayNumber} 条 · ${item.role === "user" ? "用户" : "角色"}`,
                    content: item.text,
                    contentClassName: "conversation-message-text",
                    footer: item.images.length ? (
                      <div className="conversation-images">
                        {item.images.map((image, index) => (
                          <img
                            key={image.id}
                            src={image.url}
                            alt={`第 ${item.displayNumber} 条消息的图片 ${index + 1}`}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    ) : undefined,
                  }))}
                />
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
