import styles from './MeetingDetail.module.css'

interface Meeting {
  id: string
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  organizer: string
  joinUrl?: string
  agenda?: string
}

interface MeetingDetailProps {
  meeting: Meeting
  onBack: () => void
  onJoin: (joinUrl: string) => void
}

export function MeetingDetail({ meeting, onBack, onJoin }: MeetingDetailProps) {
  const minutesUntil = Math.round((new Date(meeting.startTime).getTime() - Date.now()) / 60_000)
  const statusText = minutesUntil <= 0 ? 'STARTING NOW' : `in ${minutesUntil} min`
  const isNow = minutesUntil <= 0

  const startFormatted = new Date(meeting.startTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endFormatted = new Date(meeting.endTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className={styles.container}>
      <button className={styles.backButton} onClick={onBack} type="button">
        ← back
      </button>
      <div className={styles.status}>
        <div className={`${styles.dot} ${isNow ? styles.dotPulse : ''}`} />
        <span className={styles.statusText}>{statusText}</span>
      </div>
      <h2 className={styles.title}>{meeting.title}</h2>
      <div className={styles.timeRange}>
        {startFormatted} – {endFormatted}
      </div>
      <div className={styles.details}>
        <div>
          <div className={styles.sectionLabel}>ATTENDEES</div>
          <div className={styles.sectionContent}>
            {meeting.attendees.map((a, i) => (
              <div key={i}>
                {a}
                {a === meeting.organizer ? ' (organizer)' : ''}
              </div>
            ))}
          </div>
        </div>
        {meeting.agenda && (
          <div>
            <div className={styles.sectionLabel}>AGENDA</div>
            <div className={styles.sectionContent}>{meeting.agenda}</div>
          </div>
        )}
      </div>
      {meeting.joinUrl && (
        <button
          className={styles.joinButton}
          onClick={() => onJoin(meeting.joinUrl!)}
          type="button"
        >
          Join Meeting ↗
        </button>
      )}
    </div>
  )
}
