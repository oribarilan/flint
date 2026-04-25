export const IPC_CHANNELS = {
  // renderer → main
  CHAT_SEND: 'chat:send',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  OVERLAY_HIDE: 'overlay:hide',
  MODEL_LIST: 'model:list',
  MODEL_SET: 'model:set',

  ATTENTION_GET: 'attention:get',
  ATTENTION_OPEN: 'attention:open',
  LINK_OPEN: 'link:open',

  // main → renderer
  CHAT_DELTA: 'chat:delta',
  CHAT_DONE: 'chat:done',
  ATTENTION_UPDATE: 'attention:update',
  CONNECTION_STATUS: 'connection:status',
  MODEL_CHANGED: 'model:changed',
} as const
