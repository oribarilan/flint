//! Tauri IPC commands for file and application search.

use std::sync::Arc;

use tauri::State;

use crate::config::AppConfig;
use crate::indexer::AppIndex;
use crate::kits::{KitContextBase, KitRegistryState, KitSearchResult, KitState};
use crate::search::SearchResult;

/// Search for files by name via the OS search backend (Spotlight on macOS).
#[tauri::command]
pub async fn search_files(
    query: String,
    config: State<'_, AppConfig>,
) -> Result<Vec<SearchResult>, String> {
    #[cfg(target_os = "macos")]
    {
        let dirs = config.get().search.directories;
        let entries = crate::indexer::spotlight::search_files(&query, &dirs)
            .await
            .map_err(|e| e.to_string())?;
        Ok(entries.iter().map(SearchResult::from_entry).collect())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&query, &config);
        Ok(Vec::new())
    }
}

/// Unified search: checks command prefixes first, falls back to core file search.
///
/// Returns results in the unified [`KitSearchResult`] format. Each result
/// includes a `kind` field (`File`, `Directory`, `Application`, or `Command`).
#[tauri::command]
pub async fn search_all(
    query: String,
    registry_state: State<'_, KitRegistryState>,
    ctx_base: State<'_, KitContextBase>,
    app_index: State<'_, AppIndex>,
    config: State<'_, AppConfig>,
) -> Result<Vec<KitSearchResult>, String> {
    const MAX_RESULTS: usize = 20;

    // Check command prefix triggers under a read lock.
    let search_result = {
        let registry = registry_state.0.read().await;
        registry.search_by_prefix(&query).map(|(kit_id, cmd_id, results)| {
            let needs_init = matches!(registry.kit_state(&kit_id), Some(KitState::Registered));
            let kit_name = registry.kit_name(&kit_id).unwrap_or_default().to_string();
            (kit_id, cmd_id, results, needs_init, kit_name)
        })
    };

    if let Some((kit_id, _cmd_id, results, needs_init, kit_name)) = search_result {
        // Spawn lazy init in background if kit was just registered.
        if needs_init {
            let registry_arc = Arc::clone(&registry_state.0);
            let ctx_base_owned: KitContextBase = (*ctx_base).clone();
            let id = kit_id.clone();
            tokio::spawn(async move {
                let mut reg = registry_arc.write().await;
                if let Err(e) = reg.ensure_init(&id, &ctx_base_owned).await {
                    tracing::warn!(kit = %id, error = %e, "kit init failed");
                }
            });
        }

        let kit_results: Vec<KitSearchResult> = results
            .into_iter()
            .take(MAX_RESULTS)
            .map(|r| KitSearchResult::from_kit_result(&kit_id, &kit_name, r))
            .collect();
        return Ok(kit_results);
    }

    // No prefix matched — fall through to app search + file search + kits.
    let registry = registry_state.0.read().await;
    let kit_discovery = registry.discovery_results(&query);
    drop(registry);

    // Score preloaded apps with nucleo (fuzzy, <1ms).
    let core_scored = crate::search::scored_search(&query, &app_index.0, MAX_RESULTS);

    // Merge scored apps and kit discovery results by score descending.
    let mut scored: Vec<(u32, KitSearchResult)> = core_scored
        .into_iter()
        .map(|(score, r)| (score, KitSearchResult::from_core_result(r, score)))
        .chain(kit_discovery)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0));

    let base_results: Vec<KitSearchResult> =
        scored.into_iter().take(MAX_RESULTS).map(|(_, r)| r).collect();

    #[cfg(target_os = "macos")]
    let mut results = base_results;

    #[cfg(not(target_os = "macos"))]
    let results = base_results;

    // For 3+ char queries, also search files via Spotlight (async, ~100ms).
    #[cfg(target_os = "macos")]
    if query.len() >= 3 && results.len() < MAX_RESULTS {
        let dirs = config.get().search.directories;
        match crate::indexer::spotlight::search_files(&query, &dirs).await {
            Ok(file_entries) => {
                let remaining = MAX_RESULTS - results.len();
                results.extend(file_entries.into_iter().take(remaining).map(|entry| {
                    let sr = SearchResult::from_entry(&entry);
                    KitSearchResult::from_core_result(sr, 0)
                }));
            }
            Err(e) => {
                tracing::warn!("Spotlight file search failed: {e}");
            }
        }
    }

    // Suppress unused variable warning on non-macOS.
    let _ = &config;

    Ok(results)
}

/// Search within an active command (chip is shown in the search bar).
#[tauri::command]
pub async fn search_command(
    kit_id: String,
    command_id: String,
    query: String,
    registry_state: State<'_, KitRegistryState>,
) -> Result<Vec<KitSearchResult>, String> {
    const MAX_RESULTS: usize = 20;

    let registry = registry_state.0.read().await;
    let kit_name = registry.kit_name(&kit_id).unwrap_or_default().to_string();
    let results =
        registry.search_command(&kit_id, &command_id, &query).map_err(|e| e.to_string())?;
    drop(registry);

    Ok(results
        .into_iter()
        .take(MAX_RESULTS)
        .map(|r| KitSearchResult::from_kit_result(&kit_id, &kit_name, r))
        .collect())
}

/// Execute an Execute-mode command.
#[tauri::command]
pub async fn execute_command(
    kit_id: String,
    command_id: String,
    registry_state: State<'_, KitRegistryState>,
) -> Result<crate::kits::CommandOutput, String> {
    let registry = registry_state.0.read().await;
    registry.execute_command(&kit_id, &command_id).await.map_err(|e| e.to_string())
}

/// Handle a custom action dispatched from the frontend Action Panel.
#[tauri::command]
pub async fn handle_custom_action(
    kit_id: String,
    action_id: String,
    registry_state: State<'_, KitRegistryState>,
) -> Result<Option<String>, String> {
    let registry = registry_state.0.read().await;
    registry.handle_custom_action(&kit_id, &action_id).await.map_err(|e| e.to_string())
}
