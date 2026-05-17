import { useState, useEffect } from "react";
import styles from "./SpotlightApp.module.css";

interface MeetingData {
  title: string;
  startTime: string;
  endTime: string;
  organizer: string;
  attendees: string[];
  joinUrl?: string;
  agenda?: string;
}

const MAX_VISIBLE_ATTENDEES = 4;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatTimeUntil(iso: string): string {
  const delta = new Date(iso).getTime() - Date.now();
  if (delta <= 0) return "Starting now";
  const mins = Math.ceil(delta / 60_000);
  if (mins === 1) return "Starting in 1 minute";
  return `Starting in ${String(mins)} minutes`;
}

export function SpotlightApp() {
  const [meeting, setMeeting] = useState<MeetingData | null>(null);

  useEffect(() => {
    const unsub = window.flint?.onSpotlightShow((raw) => {
      setMeeting(raw as MeetingData);
    });
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.flint?.spotlightDismiss();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!meeting) return null;

  const timeRange = `${formatTime(meeting.startTime)} – ${formatTime(meeting.endTime)}`;
  const timeUntil = formatTimeUntil(meeting.startTime);

  // Attendees: organizer + up to 4 others
  const otherAttendees = meeting.attendees.filter((a) => a !== meeting.organizer);
  const visibleAttendees = otherAttendees.slice(0, MAX_VISIBLE_ATTENDEES);
  const overflowCount = otherAttendees.length - visibleAttendees.length;

  return (
    <div className={styles.backdrop} data-testid="spotlight-root">
      <div className={styles.card}>
        <div className={styles.timeLabel}>{timeUntil}</div>
        <h1 className={styles.title}>{meeting.title}</h1>
        <p className={styles.organizer}>Organized by {meeting.organizer}</p>

        <div className={styles.meta}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Time</span>
            <span className={styles.metaValue}>{timeRange}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>People</span>
            <div className={styles.attendees}>
              <span className={styles.attendeeChip}>{meeting.organizer}</span>
              {visibleAttendees.map((a) => (
                <span key={a} className={styles.attendeeChip}>
                  {a}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className={styles.attendeeOverflow}>
                  +{String(overflowCount)} more
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.aiSection}>
          <div className={styles.aiHeader}>
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1.5L4 5.5L5.5 7L8 4.5L10.5 7L12 5.5L8 1.5Z" />
              <path d="M8 7.5L4 11.5L5.5 13L8 10.5L10.5 13L12 11.5L8 7.5Z" />
            </svg>
            Flint Prep
          </div>
          <div className={styles.aiPlaceholder}>
            Preparing meeting context…
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btnDismiss}
            type="button"
            onClick={() => {
              window.flint?.spotlightDismiss();
            }}
          >
            Dismiss
          </button>
          {meeting.joinUrl && (
            <button
              className={styles.btnJoin}
              type="button"
              onClick={() => {
                if (meeting.joinUrl) {
                  window.flint?.spotlightJoin(meeting.joinUrl);
                }
              }}
            >
              Join Meeting
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
