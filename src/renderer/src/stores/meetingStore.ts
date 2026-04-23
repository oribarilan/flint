import { create } from 'zustand'

export interface Meeting {
  id: string
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  organizer: string
  joinUrl?: string
  agenda?: string
}

export type MeetingStatus = 'loading' | 'ready' | 'error'

interface MeetingState {
  meetings: Meeting[]
  status: MeetingStatus
  selectedMeetingId: string | null
  setMeetings: (meetings: Meeting[]) => void
  setStatus: (status: MeetingStatus) => void
  selectMeeting: (id: string) => void
  clearSelection: () => void
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  status: 'loading',
  selectedMeetingId: null,
  setMeetings: (meetings) => set({ meetings, status: 'ready' }),
  setStatus: (status) => set({ status }),
  selectMeeting: (id) => set({ selectedMeetingId: id }),
  clearSelection: () => set({ selectedMeetingId: null }),
}))
