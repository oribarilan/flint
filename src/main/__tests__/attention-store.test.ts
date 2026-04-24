import { describe, it, expect, beforeEach } from 'vitest'
import { createAttentionStore } from '../attention/store'

describe('AttentionStore', () => {
  let store: ReturnType<typeof createAttentionStore>

  beforeEach(() => {
    store = createAttentionStore()
  })

  it('starts empty', () => {
    expect(store.getAll()).toEqual([])
  })

  it('sets and retrieves items', () => {
    store.setItems([
      { id: '1', icon: '📅', title: 'Meeting', description: 'Test', metadata: {} },
    ])
    expect(store.getAll()).toHaveLength(1)
    expect(store.getAll()[0].title).toBe('Meeting')
  })

  it('replaces all items on setItems', () => {
    store.setItems([{ id: '1', icon: '📅', title: 'First', description: '', metadata: {} }])
    store.setItems([{ id: '2', icon: '💬', title: 'Second', description: '', metadata: {} }])
    expect(store.getAll()).toHaveLength(1)
    expect(store.getAll()[0].id).toBe('2')
  })

  it('finds item by id', () => {
    store.setItems([
      { id: 'a', icon: '📅', title: 'A', description: '', metadata: {} },
      { id: 'b', icon: '💬', title: 'B', description: '', metadata: {} },
    ])
    expect(store.findById('b')?.title).toBe('B')
    expect(store.findById('c')).toBeUndefined()
  })
})
