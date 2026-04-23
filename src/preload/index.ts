import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('flint', {
  platform: process.platform
})
