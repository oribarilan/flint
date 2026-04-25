import { create } from 'zustand'

export interface ModelInfo {
  id: string
  name: string
}

interface ModelState {
  currentModel: string
  models: ModelInfo[]
  setCurrentModel: (modelId: string) => void
  setModels: (models: ModelInfo[]) => void
}

export const useModelStore = create<ModelState>((set) => ({
  currentModel: 'gpt-4.1',
  models: [],
  setCurrentModel: (modelId) => set({ currentModel: modelId }),
  setModels: (models) => set({ models }),
}))
