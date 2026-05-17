import { useMemo } from "react";
import type { Meeting } from "../../../main/types";
import styles from "./Greeting.module.css";

interface GreetingProps {
  meetings: Meeting[];
}

function getGreetingText(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getNextInMinutes(meetings: Meeting[]): number | null {
  const now = Date.now();
  for (const m of meetings) {
    const start = new Date(m.startTime).getTime();
    if (start > now) {
      return Math.round((start - now) / 60_000);
    }
  }
  return null;
}

export function Greeting({ meetings }: GreetingProps) {
  const greeting = useMemo(getGreetingText, []);

  const contextLine = useMemo(() => {
    const count = meetings.length;
    const nextMin = getNextInMinutes(meetings);

    if (count === 0) return null;

    const meetingText = `${String(count)} meeting${count !== 1 ? "s" : ""} today`;
    const nextText = nextMin !== null ? `Next in ${String(nextMin)} min` : null;

    return { meetingText, nextText };
  }, [meetings]);

  return (
    <div className={styles.greeting}>
      <div className={styles.title}>{greeting}</div>
      {contextLine && (
        <div className={styles.sub}>
          <span>{contextLine.meetingText}</span>
          {contextLine.nextText && (
            <>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.highlight}>{contextLine.nextText}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
