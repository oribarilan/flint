export const IPC_CHANNELS = {
  // renderer → main
  CHAT_SEND: "chat:send",
  CHAT_RESET: "chat:reset",
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  OVERLAY_HIDE: "overlay:hide",
  MODEL_LIST: "model:list",
  MODEL_SET: "model:set",

  ATTENTION_GET: "attention:get",
  ATTENTION_OPEN: "attention:open",
  LINK_OPEN: "link:open",
  NOTIFICATION_TEST: "notification:test",
  SPOTLIGHT_DISMISS: "spotlight:dismiss",
  SPOTLIGHT_JOIN: "spotlight:join",
  BLOCKS_ACTION: "blocks:action",

  // main → renderer
  THEME_CHANGED: "theme:changed",
  CHAT_DELTA: "chat:delta",
  CHAT_DONE: "chat:done",
  ATTENTION_UPDATE: "attention:update",
  CONNECTION_STATUS: "connection:status",
  MODEL_CHANGED: "model:changed",
  SPOTLIGHT_SHOW: "spotlight:show",
  BLOCKS_UPDATE: "blocks:update",
} as const;
