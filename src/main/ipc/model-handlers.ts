import type { ConfigStore } from '../config'

export interface RawModelInfo {
  id: string
  name: string
  policy?: { state: string }
}

export interface ModelInfo {
  id: string
  name: string
}

export function filterModels(models: RawModelInfo[]): ModelInfo[] {
  return models
    .filter((m) => m.policy?.state !== 'disabled')
    .map(({ id, name }) => ({ id, name }))
}

export interface SetModelDeps {
  session: { setModel: (id: string) => Promise<void> } | null
  configStore: ConfigStore
  sendToRenderer: (modelId: string) => void
}

export async function handleSetModel(
  modelId: string,
  deps: SetModelDeps,
): Promise<void> {
  if (!deps.session) {
    // No active session — just persist the choice for next session creation
    deps.configStore.update({ model: modelId })
    deps.sendToRenderer(modelId)
    console.log('[model] set persisted (no active session):', modelId)
    return
  }
  await deps.session.setModel(modelId)
  deps.configStore.update({ model: modelId })
  deps.sendToRenderer(modelId)
  console.log('[model] set applied:', modelId)
}
