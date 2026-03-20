//! Fuzzy-search discovery of kit commands.

use nucleo::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo::{Matcher, Utf32Str};

use super::{IndexedCommand, KitRegistry};
use crate::kits::{KitAction, KitSearchResult, ResultKind};

impl KitRegistry {
    /// Return commands whose name matches the query, as discoverable search results.
    ///
    /// Each command is a separate result with `ResultKind::Command`.
    /// Only enabled commands are included.
    pub fn discovery_results(&self, query: &str) -> Vec<(u32, KitSearchResult)> {
        let pattern =
            Pattern::new(query, CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
        let mut buf = Vec::new();

        self.commands
            .iter()
            .filter(|ic| ic.enabled)
            .filter_map(|indexed| score_command(indexed, &pattern, &mut matcher, &mut buf, self))
            .collect()
    }
}

/// Score a single indexed command against the query pattern.
///
/// Matches against both command name and parent kit name, taking the best
/// score. This lets "window" surface "Left Half" because its parent kit is
/// "Window Management".
fn score_command(
    indexed: &IndexedCommand,
    pattern: &Pattern,
    matcher: &mut Matcher,
    buf: &mut Vec<char>,
    registry: &KitRegistry,
) -> Option<(u32, KitSearchResult)> {
    let kit_name_str =
        registry.kits.get(&indexed.kit_id).map(|k| k.manifest().name).unwrap_or_default();

    let cmd_lower = indexed.def.name.to_lowercase();
    let cmd_haystack = Utf32Str::new(&cmd_lower, buf);
    let cmd_score = pattern.score(cmd_haystack, matcher);

    let kit_lower = kit_name_str.to_lowercase();
    let kit_haystack = Utf32Str::new(&kit_lower, buf);
    let kit_score = pattern.score(kit_haystack, matcher);

    let raw_score = cmd_score.max(kit_score)?;
    let score = raw_score.saturating_add(crate::search::APP_BOOST);

    Some((
        score,
        KitSearchResult {
            kit_id: indexed.kit_id.clone(),
            kit_name: Some(kit_name_str.to_string()),
            id: format!("cmd-discovery:{}:{}", indexed.kit_id, indexed.def.id),
            title: indexed.def.name.to_string(),
            subtitle: Some(indexed.def.description.to_string()),
            icon: Some(indexed.def.icon.clone()),
            kind: ResultKind::Command {
                kit_id: indexed.kit_id.clone(),
                command_id: indexed.def.id.to_string(),
                mode: indexed.def.mode.clone(),
            },
            accessories: Vec::new(),
            actions: vec![KitAction::ActivateCommand {
                kit_id: indexed.kit_id.clone(),
                command_id: indexed.def.id.to_string(),
            }],
            preview: None,
            score: Some(score),
        },
    ))
}
