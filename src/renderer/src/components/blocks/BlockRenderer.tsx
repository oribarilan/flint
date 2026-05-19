import type { FlintBlock } from "../../../../main/lib/blocks";
import { MeetingList } from "./MeetingList";
import { AttentionList } from "./AttentionList";
import { MeetingCard } from "./MeetingCard";
import { ActionConfirmation } from "./ActionConfirmation";
import { ChatMessage } from "./ChatMessage";

interface BlockRendererProps {
  block: FlintBlock;
  onDismiss?: () => void;
}

export function BlockRenderer({ block, onDismiss }: BlockRendererProps) {
  switch (block.type) {
    case "meeting-list":
      return <MeetingList meetings={block.data} />;
    case "attention-list":
      return <AttentionList items={block.data} />;
    case "meeting-card":
      return <MeetingCard data={block.data} />;
    case "action-confirmation":
      return onDismiss ? <ActionConfirmation data={block.data} onDismiss={onDismiss} /> : null;
    case "chat-message":
      return <ChatMessage content={block.data.content} />;
    case "suggestion-chips":
      return null;
    default:
      return null;
  }
}
