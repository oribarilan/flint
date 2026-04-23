import { useEffect } from 'react'
import { useMeetingStore } from '../stores/meetingStore'
import type { Meeting } from '../stores/meetingStore'

export function useMeetings() {
  const { meetings, status, selectedMeetingId, setMeetings, selectMeeting, clearSelection } =
    useMeetingStore()

  useEffect(() => {
    window.flint?.getMeetings().then((raw) => setMeetings(raw as Meeting[]))

    const unsub = window.flint?.onMeetingsUpdate((raw) => setMeetings(raw as Meeting[]))
    return () => {
      unsub?.()
    }
  }, [setMeetings])

  const selectedMeeting = meetings.find((m) => m.id === selectedMeetingId) ?? null

  return { meetings, status, selectedMeeting, selectMeeting, clearSelection }
}
