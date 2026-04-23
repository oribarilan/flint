import { describe, it, expect, beforeEach } from 'vitest'
import { useMeetingStore } from '../meetingStore'

describe('meetingStore', () => {
  beforeEach(() => {
    useMeetingStore.setState({ meetings: [], status: 'loading', selectedMeetingId: null })
  })

  it('starts in loading state', () => {
    expect(useMeetingStore.getState().status).toBe('loading')
    expect(useMeetingStore.getState().meetings).toEqual([])
  })

  it('setMeetings updates meetings and status', () => {
    useMeetingStore.getState().setMeetings([
      { id: '1', title: 'Test', startTime: '', endTime: '', attendees: [], organizer: '' },
    ])
    expect(useMeetingStore.getState().meetings).toHaveLength(1)
    expect(useMeetingStore.getState().status).toBe('ready')
  })

  it('selectMeeting and clearSelection work', () => {
    useMeetingStore.getState().selectMeeting('abc')
    expect(useMeetingStore.getState().selectedMeetingId).toBe('abc')
    useMeetingStore.getState().clearSelection()
    expect(useMeetingStore.getState().selectedMeetingId).toBeNull()
  })
})
