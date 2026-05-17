import type { Meeting } from "../../../../main/types";
import { MeetingRow } from "../MeetingRow";

interface MeetingListProps {
  meetings: Meeting[];
}

export function MeetingList({ meetings }: MeetingListProps) {
  if (meetings.length === 0) return null;
  return (
    <div>
      {meetings.map((m) => (
        <MeetingRow key={m.id} meeting={m} />
      ))}
    </div>
  );
}
