import type { PillState, SuggestionChip } from "../../../../main/lib/blocks";
import styles from "./SuggestionChips.module.css";

interface SuggestionChipsProps {
  pillState: PillState;
  onSend: (prompt: string) => void;
  onBack?: () => void;
  onJoin?: () => void;
}

const CHIPS_BY_STATE: Record<PillState, SuggestionChip[]> = {
  briefing: [
    { label: "What's next?", prompt: "What's next on my calendar?" },
    { label: "Prep for next meeting", prompt: "Help me prepare for my next meeting" },
  ],
  "meeting-focus": [
    { label: "Join", prompt: "__action:join" },
    { label: "Prep notes", prompt: "Give me preparation notes for this meeting" },
    { label: "Back", prompt: "__action:back" },
  ],
  chat: [],
  "action-confirm": [],
};

export function SuggestionChips({ pillState, onSend, onBack, onJoin }: SuggestionChipsProps) {
  const chips = CHIPS_BY_STATE[pillState];
  if (chips.length === 0) return null;

  const handleClick = (chip: SuggestionChip) => {
    if (chip.prompt === "__action:back" && onBack) {
      onBack();
    } else if (chip.prompt === "__action:join" && onJoin) {
      onJoin();
    } else if (!chip.prompt.startsWith("__action:")) {
      onSend(chip.prompt);
    }
  };

  return (
    <div className={styles.chips} role="group" aria-label="Suggestions">
      {chips.map((chip) => (
        <button
          key={chip.label}
          className={styles.chip}
          onClick={() => {
            handleClick(chip);
          }}
          type="button"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
