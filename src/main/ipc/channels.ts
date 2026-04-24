export const IPC_CHANNELS = {
  // renderer → main
  CHAT_SEND: 'chat:send',
  MEETINGS_GET: 'meetings:get',
  MEETING_JOIN: 'meeting:join',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  OVERLAY_HIDE: 'overlay:hide',

  ATTENTION_GET: 'attention:get',
  ATTENTION_OPEN: 'attention:open',

  // main → renderer
  CHAT_DELTA: 'chat:delta',
  CHAT_DONE: 'chat:done',
  MEETINGS_UPDATE: 'meetings:update',
  ATTENTION_UPDATE: 'attention:update',
  CONNECTION_STATUS: 'connection:status',
} as const
