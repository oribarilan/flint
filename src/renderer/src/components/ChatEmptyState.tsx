import { AttentionIcon } from "./AttentionIcon";
import { useAttentionStore } from "../stores/attentionStore";
import { buildSuggestions } from "../utils/suggestions";
import styles from "./ChatEmptyState.module.css";

export function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface ChatEmptyStateProps {
  onSend: (prompt: string) => void;
  keyboardFocusedIndex?: number | null;
}

export function ChatEmptyState({ onSend, keyboardFocusedIndex }: ChatEmptyStateProps) {
  const greeting = getGreeting(new Date().getHours());
  const attentionItems = useAttentionStore((s) => s.items);
  const suggestions = buildSuggestions(attentionItems);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.greeting}>{greeting}</h2>
        <p className={styles.subtitle}>I can help you stay on top of your day. Try asking about:</p>
      </div>
      <div className={styles.cards} role="group" aria-label="Suggested prompts">
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.title}
            className={`${styles.card} ${keyboardFocusedIndex === index ? styles.keyboardFocused : ""}`}
            data-testid={`suggestion-card-${index}`}
            type="button"
            onClick={() => onSend(suggestion.title)}
          >
            <span className={styles.cardIcon} aria-hidden="true">
              <AttentionIcon name={suggestion.icon} size={16} />
            </span>
            <div className={styles.cardText}>
              <span className={styles.cardTitle}>{suggestion.title}</span>
              <span className={styles.cardDescription}>{suggestion.description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
