import { Notification, shell } from 'electron'
import { defineTool, type Tool } from '@github/copilot-sdk'
import type { Meeting } from '../types'

interface ToolCallbacks {
  onMeetings: (meetings: Meeting[]) => void
  onShowOverlay: (meetingId?: string) => void
  getMeetings?: () => Meeting[]
}

export function createAllTools(callbacks: ToolCallbacks): Tool[] {
  const reportMeetings = defineTool('report_meetings', {
    description: 'Report a list of upcoming meetings with structured data.',
    parameters: {
      type: 'object',
      properties: {
        meetings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              attendees: { type: 'array', items: { type: 'string' } },
              organizer: { type: 'string' },
              joinUrl: { type: 'string' },
              agenda: { type: 'string' },
            },
            required: ['id', 'title', 'startTime', 'endTime', 'attendees', 'organizer'],
          },
        },
      },
      required: ['meetings'],
    },
    handler: async (args) => {
      callbacks.onMeetings((args as { meetings: Meeting[] }).meetings)
      return 'ok'
    },
  })

  const getMeetings = defineTool('get_meetings', {
    description: 'Get the current list of upcoming meetings from the local cache.',
    parameters: { type: 'object', properties: {} },
    handler: async () => callbacks.getMeetings?.() ?? [],
  })

  const showNotification = defineTool('show_notification', {
    description: 'Show a native OS notification.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['title', 'body'],
    },
    handler: async (args) => {
      const { title, body } = args as { title: string; body: string }
      const notification = new Notification({ title, body })
      notification.show()
      return 'shown'
    },
  })

  const joinMeeting = defineTool('join_meeting', {
    description: 'Open a meeting join URL in the default browser.',
    parameters: {
      type: 'object',
      properties: { joinUrl: { type: 'string' } },
      required: ['joinUrl'],
    },
    handler: async (args) => {
      await shell.openExternal((args as { joinUrl: string }).joinUrl)
      return 'opened'
    },
  })

  const showOverlay = defineTool('show_overlay', {
    description: 'Show the Flint overlay window.',
    parameters: {
      type: 'object',
      properties: { meetingId: { type: 'string' } },
    },
    handler: async (args) => {
      callbacks.onShowOverlay((args as { meetingId?: string }).meetingId)
      return 'shown'
    },
  })

  return [reportMeetings, getMeetings, showNotification, joinMeeting, showOverlay]
}

export function getMonitorTools(callbacks: Pick<ToolCallbacks, 'onMeetings'>): Tool[] {
  const all = createAllTools({ ...callbacks, onShowOverlay: () => {} })
  return all.filter((t) => t.name === 'report_meetings')
}

export function getChatTools(callbacks: Omit<ToolCallbacks, 'onMeetings'>): Tool[] {
  const all = createAllTools({ onMeetings: () => {}, ...callbacks })
  return all.filter((t) => t.name !== 'report_meetings')
}
