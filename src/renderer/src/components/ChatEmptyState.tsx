import styles from "./ChatEmptyState.module.css";

interface Suggestion {
  icon: string;
  title: string;
  description: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: "📅",
    title: "What are my next meetings?",
    description: "See upcoming meetings, times, and attendees",
  },
  {
    icon: "📋",
    title: "Prepare me for my next meeting",
    description: "Get agenda, attendee context, and talking points",
  },
  {
    icon: "⚠️",
    title: "Any conflicts this week?",
    description: "Find overlapping or back-to-back meetings",
  },
  {
    icon: "📊",
    title: "Summarize today's schedule",
    description: "Quick overview of your day at a glance",
  },
];

export function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface ChatEmptyStateProps {
  onSend: (prompt: string) => void;
}

export function ChatEmptyState({ onSend }: ChatEmptyStateProps) {
  const greeting = getGreeting(new Date().getHours());

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.greeting}>{greeting}</h2>
        <p className={styles.subtitle}>I can help you stay on top of your day. Try asking about:</p>
      </div>
      <div className={styles.cards} role="group" aria-label="Suggested prompts">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            className={styles.card}
            type="button"
            onClick={() => onSend(suggestion.title)}
          >
            <span className={styles.cardIcon} aria-hidden="true">
              {suggestion.icon}
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
