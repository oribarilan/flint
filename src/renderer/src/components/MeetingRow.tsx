import { useMemo, useCallback } from "react";
import { Calendar } from "lucide-react";
import type { Meeting } from "../../../main/types";
import styles from "./MeetingRow.module.css";

interface MeetingRowProps {
  meeting: Meeting;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getMinutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}

export function MeetingRow({ meeting }: MeetingRowProps) {
  const minutesUntil = useMemo(() => getMinutesUntil(meeting.startTime), [meeting.startTime]);
  const imminent = minutesUntil >= 0 && minutesUntil <= 15;
  const timeLabel = imminent ? `in ${String(minutesUntil)} min` : formatTime(meeting.startTime);
  const attendeeCount = meeting.attendees.length;

  const handleJoin = useCallback(() => {
    if (meeting.joinUrl) {
      window.flint?.openLink(meeting.joinUrl);
    }
  }, [meeting.joinUrl]);

  return (
    <div className={`${styles.row} ${imminent ? styles.imminent : ""}`}>
      <div className={`${styles.icon} ${imminent ? styles.iconImminent : ""}`}>
        <Calendar size={13} aria-hidden="true" />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{meeting.title}</div>
        {attendeeCount > 0 && (
          <div className={styles.meta}>
            <span>
              {attendeeCount} {attendeeCount === 1 ? "person" : "people"}
            </span>
          </div>
        )}
      </div>
      <span className={`${styles.time} ${imminent ? styles.timeSoon : ""}`}>{timeLabel}</span>
      {imminent && meeting.joinUrl && (
        <button className={styles.joinBtn} onClick={handleJoin} type="button">
          Join
        </button>
      )}
    </div>
  );
}
