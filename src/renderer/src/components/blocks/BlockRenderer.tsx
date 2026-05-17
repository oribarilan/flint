import type { FlintBlock } from "../../../../main/lib/blocks";
import { MeetingList } from "./MeetingList";
import { AttentionList } from "./AttentionList";

interface BlockRendererProps {
  block: FlintBlock;
}

export function BlockRenderer({ block }: BlockRendererProps) {
  switch (block.type) {
    case "meeting-list":
      return <MeetingList meetings={block.data} />;
    case "attention-list":
      return <AttentionList items={block.data} />;
    case "meeting-card":
    case "action-confirmation":
    case "chat-message":
    case "suggestion-chips":
      return null;
    default:
      return null;
  }
}
