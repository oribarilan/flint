import { Notification } from 'electron'
import type { Meeting } from '../types'

export function fireNotification(
  meeting: Meeting,
  onClickShowOverlay: (meetingId: string) => void
): { notification: Notification } {
  const minutesUntil = Math.round(
    (new Date(meeting.startTime).getTime() - Date.now()) / 60_000
  )
  const timeText = minutesUntil <= 1 ? 'now' : `in ${minutesUntil} min`

  const attendeeText =
    meeting.attendees.length > 0
      ? ` — ${meeting.attendees.slice(0, 3).join(', ')}${meeting.attendees.length > 3 ? '...' : ''}`
      : ''

  const notification = new Notification({
    title: `Meeting ${timeText}`,
    body: `${meeting.title}${attendeeText}`,
  })

  notification.on('click', () => {
    onClickShowOverlay(meeting.id)
  })

  notification.show()
  return { notification }
}
