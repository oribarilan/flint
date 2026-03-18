# Split Files Exceeding 500 LOC

## Summary

Several source files exceed the 500 LOC limit from AGENTS.md ("Files should stay under 500 LOC. When something grows beyond its scope, split it."). These need to be split into focused modules while preserving public APIs.

## Files

| File                                         | LOC  | Suggested Split                                                                                                                                                                                                                  |
| -------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/kits/registry.rs`             | 1337 | Extract `CoreActions` (action building for file/app/dir results) into `kits/core_actions.rs`. Extract `TaskManager` into `kits/task_manager.rs`. Extract `from_core_search`/`from_kit_result` converters into `kits/convert.rs`. |
| `src-tauri/src/kits/clipboard/mod.rs`        | 769  | Extract `entry_to_result` and search/execute logic into `clipboard/search.rs` and `clipboard/execute.rs`. Keep `ClipboardKit` struct + `Kit` impl in `mod.rs`.                                                                   |
| `src-tauri/src/kits/clipboard/store.rs`      | 714  | Extract serialization (`ClipboardEntryRaw`, `StoreData`) into `clipboard/persistence.rs`. Keep `ClipboardStore` and entry management in `store.rs`.                                                                              |
| `src-tauri/src/kits/mod.rs`                  | 644  | Types and serialization dominate. Extract `KitAction`, `ResultKind`, and related serde impls into `kits/actions.rs`. Keep `Kit` trait, `CommandDef`, `CommandMode` in `mod.rs`.                                                  |
| `src-tauri/src/commands.rs`                  | 625  | Group commands by domain: file commands → `commands/files.rs`, agent commands → `commands/agent.rs`, config commands → `commands/config.rs`, kit commands → `commands/kits.rs`.                                                  |
| `src-tauri/src/kits/clipboard/privacy.rs`    | 545  | Close to limit. Could extract pattern-matching constants and helpers into `clipboard/patterns.rs`, but lower priority.                                                                                                           |
| `src/hooks/__tests__/useKeybindings.test.ts` | 531  | Test file — slightly over. Could split by describe block but lower priority.                                                                                                                                                     |

## Implementation

1. Start with `registry.rs` (most over limit, clearest split points).
2. Use `pub(crate)` for internal items, `pub` only for cross-module API.
3. Move tests with their code — each new module gets its own `#[cfg(test)]` block.
4. After each split, run `just check` to verify nothing breaks.
5. Repeat for remaining files in order of severity.

## Notes

- `privacy.rs` (545) and `useKeybindings.test.ts` (531) are only slightly over — lower priority.
- Test files being slightly over is less concerning than production code.
