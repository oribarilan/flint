import { Calendar, Users, Clock, FileText } from "lucide-react";
import type { MeetingCardData } from "../../../../main/lib/blocks";
import styles from "./MeetingCard.module.css";

interface MeetingCardProps {
  data: MeetingCardData;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MeetingCard({ data }: MeetingCardProps) {
  const timeRange = `${formatTime(data.startTime)} – ${formatTime(data.endTime)}`;

  return (
    <div className={styles.card} data-testid="meeting-card">
      <div className={styles.header}>
        <Calendar size={16} aria-hidden="true" className={styles.icon} />
        <h2 className={styles.title}>{data.title}</h2>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaRow}>
          <Clock size={13} aria-hidden="true" />
          <span>{data.isAllDay ? "All day" : timeRange}</span>
        </div>
        <div className={styles.metaRow}>
          <Users size={13} aria-hidden="true" />
          <span>
            {data.organizer}
            {data.attendees.length > 0 ? ` + ${String(data.attendees.length)}` : ""}
          </span>
        </div>
      </div>

      {data.agenda && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            <FileText size={12} aria-hidden="true" />
            Agenda
          </div>
          <p className={styles.sectionContent}>{data.agenda}</p>
        </div>
      )}

      {data.aiPrep && data.aiPrep.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Prep notes</div>
          <ul className={styles.prepList}>
            {data.aiPrep.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
