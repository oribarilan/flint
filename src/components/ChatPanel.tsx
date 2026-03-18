import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage, type AvailableModelEntry } from "../stores/chatStore";
import { getAvailableModels, getSessionMessages, openSettings } from "../lib/commands";
import { renderMarkdown } from "../lib/markdown";
import styles from "./ChatPanel.module.css";

// ---------------------------------------------------------------------------
// Tool display names and icons
// ---------------------------------------------------------------------------

const TOOL_META: Record<string, { name: string; icon: string }> = {
  bash: { name: "Terminal", icon: "⌨" },
  file_edit: { name: "Edit File", icon: "✏" },
  file_read: { name: "Read File", icon: "📄" },
  file_search: { name: "Search Files", icon: "🔍" },
  glob: { name: "Find Files", icon: "📁" },
  grep: { name: "Search Code", icon: "🔎" },
  list_directory: { name: "List Directory", icon: "📂" },
  calculate: { name: "Calculator", icon: "🧮" },
  web_search: { name: "Web Search", icon: "🌐" },
  mcp: { name: "MCP Tool", icon: "🔌" },
};

function getToolMeta(toolName: string): { name: string; icon: string } {
  // Check for MCP-prefixed tools (e.g., "mcp_github_search")
  if (toolName.startsWith("mcp_") || toolName.includes("__")) {
    const parts = toolName.replace("mcp_", "").split("_");
    const prettyName = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    return { name: prettyName, icon: "🔌" };
  }
  return TOOL_META[toolName] ?? { name: toolName, icon: "⚙" };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "error") {
    return <div className={styles.error}>{message.content}</div>;
  }

  const isUser = message.role === "user";
  if (isUser) {
    return <div className={styles.userMessage}>{message.content}</div>;
  }

  return <div className={styles.assistantMessage}>{renderMarkdown(message.content)}</div>;
}

function ToolCallCard({ toolName, state }: { toolName: string; state: "running" | "done" }) {
  const meta = getToolMeta(toolName);
  const isRunning = state === "running";

  return (
    <div className={isRunning ? styles.toolCard : styles.toolCardDone}>
      <span className={styles.toolIcon}>{meta.icon}</span>
      <span className={styles.toolName}>{meta.name}</span>
      {isRunning && <span className={styles.toolSpinner} />}
      {!isRunning && <span className={styles.toolCheck}>✓</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model picker list — replaces messages area when active
// ---------------------------------------------------------------------------

function filterModels(models: AvailableModelEntry[], query: string): AvailableModelEntry[] {
  if (!query) return models;
  const lower = query.toLowerCase();
  return models.filter(
    (m) =>
      m.name.toLowerCase().includes(lower) ||
      m.providerName.toLowerCase().includes(lower) ||
      m.id.toLowerCase().includes(lower),
  );
}

function ModelPickerList() {
  const models = useChatStore((s) => s.availableModels);
  const query = useChatStore((s) => s.modelPickerQuery);
  const selectedIndex = useChatStore((s) => s.modelPickerIndex);
  const selectedModel = useChatStore((s) => s.selectedModel);

  const filtered = filterModels(models, query);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = container.querySelectorAll("[role='option']");
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleSelect = (model: AvailableModelEntry) => {
    useChatStore.getState().setSelectedModel({
      providerId: model.providerId,
      modelId: model.id.split("/").slice(1).join("/"),
      displayName: model.name,
    });
    useChatStore.getState().closeModelPicker();
  };

  if (filtered.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyText}>No models match "{query}"</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.modelList} role="listbox" aria-label="Models">
      {filtered.map((model, index) => {
        const isCurrent =
          selectedModel?.providerId === model.providerId &&
          model.id === `${selectedModel.providerId}/${selectedModel.modelId}`;
        return (
          <div
            key={model.id}
            className={index === selectedIndex ? styles.modelItemSelected : styles.modelItem}
            role="option"
            aria-selected={index === selectedIndex}
            onMouseEnter={() => {
              useChatStore.getState().setModelPickerIndex(index);
            }}
            onClick={() => {
              handleSelect(model);
            }}
          >
            <span className={styles.modelItemName}>{model.name}</span>
            <span className={styles.modelItemProvider}>{model.providerName}</span>
            {isCurrent && <span className={styles.modelItemCurrent}>current</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentResponse = useChatStore((s) => s.currentResponse);
  const activeToolCalls = useChatStore((s) => s.activeToolCalls);
  const chatStatus = useChatStore((s) => s.chatStatus);
  const statusChecked = useChatStore((s) => s.statusChecked);
  const modelPickerOpen = useChatStore((s) => s.modelPickerOpen);
  const [completedTools, setCompletedTools] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const isConfigured = chatStatus.repoPath !== null;

  // Fetch models and session history on mount (only when connected)
  useEffect(() => {
    if (!chatStatus.connected) return;

    void getAvailableModels()
      .then(([list, dflt]) => {
        const entries = list.map((m) => ({
          id: m.id,
          name: m.name,
          providerId: m.provider_id,
          providerName: m.provider_name,
        }));
        useChatStore.getState().setAvailableModels(entries);
        // Auto-select default if none selected
        if (!useChatStore.getState().selectedModel && dflt) {
          const found = list.find((m) => m.id === dflt);
          if (found) {
            useChatStore.getState().setSelectedModel({
              providerId: found.provider_id,
              modelId: found.id.split("/").slice(1).join("/"),
              displayName: found.name,
            });
          }
        }
      })
      .catch(() => {
        // Models unavailable — non-critical, panel still usable.
      });

    // Hydrate chat with existing session history (if any).
    if (useChatStore.getState().messages.length === 0) {
      void getSessionMessages()
        .then((history) => {
          if (history.length > 0) {
            useChatStore.getState().setMessages(
              history.map((m) => ({
                role: m.role as ChatMessage["role"],
                content: m.content,
              })),
            );
          }
        })
        .catch(() => {
          // History unavailable — non-critical, start fresh.
        });
    }
  }, [chatStatus.connected]);

  // Track completed tool calls
  useEffect(() => {
    const activeNames = new Set(activeToolCalls.map((tc) => tc.toolName));
    setCompletedTools((prev) => prev.filter((name) => !activeNames.has(name)));
  }, [activeToolCalls]);

  const prevToolsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentNames = activeToolCalls.map((tc) => tc.toolName);
    const removed = prevToolsRef.current.filter((name) => !currentNames.includes(name));
    if (removed.length > 0) {
      setCompletedTools((prev) => [...prev, ...removed]);
      setTimeout(() => {
        setCompletedTools((prev) => prev.filter((name) => !removed.includes(name)));
      }, 3000);
    }
    prevToolsRef.current = currentNames;
  }, [activeToolCalls]);

  // Auto-scroll on new content
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, currentResponse, activeToolCalls]);

  const hasContent = messages.length > 0 || isStreaming;

  const handleNewChat = () => {
    useChatStore.getState().clearChat();
    setCompletedTools([]);
    void import("../lib/commands").then(({ clearChat }) => {
      clearChat().catch(() => {
        // Clear failed — non-critical.
      });
    });
  };

  const handleSuggestion = (text: string) => {
    useChatStore.getState().addUserMessage(text);
    void import("../lib/commands").then(({ sendChatMessage }) => {
      const model = useChatStore.getState().selectedModel;
      sendChatMessage(text, model?.providerId, model?.modelId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to send message";
        useChatStore.getState().setError(message);
      });
    });
  };

  // Guard: waiting for initial status check
  if (!statusChecked) {
    return <div className={styles.panel} />;
  }

  // Guard: second brain not configured — lock chat
  if (!isConfigured) {
    return (
      <div className={styles.panel}>
        <div className={styles.notConfigured}>
          <div className={styles.emptyIcon}>✦</div>
          <div className={styles.emptyTitle}>Second Brain Not Connected</div>
          <div className={styles.emptyText}>
            Connect a notes repository in Settings to start chatting with your second brain.
          </div>
          <button
            className={styles.configureButton}
            onClick={() => {
              void openSettings();
            }}
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* Chat header — new chat + status */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>Agent Mode</div>
        <div className={styles.headerActions}>
          {hasContent && (
            <button
              className={styles.newChatButton}
              onClick={handleNewChat}
              title="New chat"
              aria-label="New chat"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
            </button>
          )}
          {chatStatus.connected && <span className={styles.statusDot} title="Connected" />}
        </div>
      </div>

      {/* Model picker list OR messages area */}
      {modelPickerOpen ? (
        <ModelPickerList />
      ) : (
        <div ref={containerRef} className={styles.container}>
          {!hasContent && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>✦</div>
              <div className={styles.emptyTitle}>Second Brain Doctor</div>
              <div className={styles.emptyText}>
                Ask anything about your notes, or try a suggestion:
              </div>
              <div className={styles.suggestions}>
                <button
                  className={styles.suggestionButton}
                  onClick={() => {
                    handleSuggestion("What did I work on this week?");
                  }}
                >
                  What did I work on this week?
                </button>
                <button
                  className={styles.suggestionButton}
                  onClick={() => {
                    handleSuggestion("Find notes that need updating or are incomplete");
                  }}
                >
                  Find incomplete notes
                </button>
                <button
                  className={styles.suggestionButton}
                  onClick={() => {
                    handleSuggestion("Summarize my current projects and their status");
                  }}
                >
                  Project status summary
                </button>
                <button
                  className={styles.suggestionButton}
                  onClick={() => {
                    handleSuggestion("What topics am I learning about? Show my progress.");
                  }}
                >
                  Learning progress
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <Message key={i} message={msg} />
          ))}

          {(activeToolCalls.length > 0 || completedTools.length > 0) && (
            <div className={styles.toolCalls}>
              {completedTools.map((name) => (
                <ToolCallCard key={`done-${name}`} toolName={name} state="done" />
              ))}
              {activeToolCalls.map((tc) => (
                <ToolCallCard key={`run-${tc.toolName}`} toolName={tc.toolName} state="running" />
              ))}
            </div>
          )}

          {isStreaming && currentResponse.length > 0 && (
            <div className={styles.assistantMessage}>{renderMarkdown(currentResponse)}</div>
          )}

          {isStreaming && currentResponse.length === 0 && activeToolCalls.length === 0 && (
            <div className={styles.thinking} aria-label="Thinking">
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
