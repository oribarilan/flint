import { useEffect, useRef, useState } from "react";
import { useChatStore, type ChatMessage, type SelectedModel } from "../stores/chatStore";
import { getAvailableModels, type AvailableModel } from "../lib/commands";
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
  return (
    <div className={isUser ? styles.userMessage : styles.assistantMessage}>{message.content}</div>
  );
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

function ModelSelector({
  selectedModel,
  onSelectModel,
}: {
  selectedModel: SelectedModel | null;
  onSelectModel: (model: SelectedModel | null) => void;
}) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch models on mount
  useEffect(() => {
    getAvailableModels()
      .then(([list, dflt]) => {
        setModels(list);
        setDefaultModel(dflt);
        // Auto-select default if none selected
        if (!selectedModel && dflt) {
          const parts = dflt.split("/");
          if (parts.length >= 2) {
            const found = list.find((m) => m.id === dflt);
            if (found) {
              onSelectModel({
                providerId: found.provider_id,
                modelId: found.id.split("/").slice(1).join("/"),
                displayName: found.name,
              });
            }
          }
        }
      })
      .catch(() => {
        // Models unavailable — will show "default"
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const displayName = selectedModel?.displayName ?? "Default model";

  // Group models by provider
  const grouped = models.reduce<Record<string, AvailableModel[]>>((acc, m) => {
    const group = acc[m.provider_name] ?? [];
    group.push(m);
    acc[m.provider_name] = group;
    return acc;
  }, {});

  return (
    <div className={styles.modelSelector} ref={dropdownRef}>
      <button
        className={styles.modelButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={styles.modelLabel}>{displayName}</span>
        <svg
          className={styles.modelChevron}
          viewBox="0 0 16 16"
          fill="currentColor"
          width="12"
          height="12"
        >
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
        </svg>
      </button>

      {isOpen && models.length > 0 && (
        <div className={styles.modelDropdown} role="listbox">
          {Object.entries(grouped).map(([providerName, providerModels]) => (
            <div key={providerName}>
              <div className={styles.modelGroupLabel}>{providerName}</div>
              {providerModels.map((m) => {
                const isSelected =
                  selectedModel?.providerId === m.provider_id &&
                  `${m.provider_id}/${selectedModel?.modelId}` === m.id;
                const isDefault = m.id === defaultModel;
                return (
                  <button
                    key={m.id}
                    className={isSelected ? styles.modelOptionSelected : styles.modelOption}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectModel({
                        providerId: m.provider_id,
                        modelId: m.id.split("/").slice(1).join("/"),
                        displayName: m.name,
                      });
                      setIsOpen(false);
                    }}
                  >
                    <span>{m.name}</span>
                    {isDefault && <span className={styles.modelDefault}>default</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
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
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const chatStatus = useChatStore((s) => s.chatStatus);
  const [completedTools, setCompletedTools] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track completed tool calls
  useEffect(() => {
    const activeNames = new Set(activeToolCalls.map((tc) => tc.toolName));
    setCompletedTools((prev) => prev.filter((name) => !activeNames.has(name)));
  }, [activeToolCalls]);

  // Mark tools as completed when they are removed
  const prevToolsRef = useRef<string[]>([]);
  useEffect(() => {
    const currentNames = activeToolCalls.map((tc) => tc.toolName);
    const removed = prevToolsRef.current.filter((name) => !currentNames.includes(name));
    if (removed.length > 0) {
      setCompletedTools((prev) => [...prev, ...removed]);
      // Auto-clear completed tools after 3 seconds
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

  return (
    <div className={styles.panel}>
      {/* Chat header — model selector + status */}
      <div className={styles.header}>
        <ModelSelector selectedModel={selectedModel} onSelectModel={setSelectedModel} />
        <div className={styles.headerStatus}>
          {chatStatus.connected && <span className={styles.statusDot} title="Connected" />}
        </div>
      </div>

      {/* Messages area */}
      <div ref={containerRef} className={styles.container}>
        {!hasContent && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>✦</div>
            <div className={styles.emptyText}>Ask anything about your second brain</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}

        {/* Tool call cards */}
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

        {/* Streaming response */}
        {isStreaming && currentResponse.length > 0 && (
          <div className={styles.streaming}>{currentResponse}</div>
        )}

        {/* Thinking dots */}
        {isStreaming && currentResponse.length === 0 && activeToolCalls.length === 0 && (
          <div className={styles.thinking} aria-label="Thinking">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}
      </div>
    </div>
  );
}
