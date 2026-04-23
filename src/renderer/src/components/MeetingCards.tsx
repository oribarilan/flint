import styles from './MeetingCards.module.css'

interface Meeting {
  id: string
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  organizer: string
  joinUrl?: string
}

interface MeetingCardsProps {
  meetings: Meeting[]
  alertMinutes: number
  onSelect: (id: string) => void
  onJoin: (joinUrl: string) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatTimeUntil(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function MeetingCards({ meetings, alertMinutes, onSelect, onJoin }: MeetingCardsProps) {
  if (meetings.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>⚡</span>
        <span className={styles.emptyText}>No upcoming meetings</span>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      <div className={styles.label}>UPCOMING</div>
      {meetings.map((meeting) => {
        const minutesUntil = (new Date(meeting.startTime).getTime() - Date.now()) / 60_000
        const isImminent = minutesUntil <= alertMinutes && minutesUntil > 0

        return (
          <button
            key={meeting.id}
            className={`${styles.card} ${isImminent ? styles.imminent : ''}`}
            onClick={() => onSelect(meeting.id)}
            type="button"
          >
            <div className={styles.time}>
              <div className={styles.timeValue}>{formatTime(meeting.startTime)}</div>
              <div className={styles.timeUntil}>{formatTimeUntil(meeting.startTime)}</div>
            </div>
            <div className={styles.info}>
              <div className={styles.title}>{meeting.title}</div>
              <div className={styles.attendees}>
                {meeting.attendees.slice(0, 3).join(', ')}
                {meeting.attendees.length > 3 ? '...' : ''}
              </div>
            </div>
            {isImminent && meeting.joinUrl && (
              <button
                className={styles.joinButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onJoin(meeting.joinUrl!)
                }}
                type="button"
              >
                Join ↗
              </button>
            )}
          </button>
        )
      })}
    </div>
  )
}
