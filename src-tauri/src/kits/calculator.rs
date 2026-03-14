//! Calculator kit — evaluate math expressions inline.
//!
//! Activated by the `=` prefix: `= 2+3` → `5`.
//! When the query is empty (just `=`), shows recent calculation history.

use std::collections::VecDeque;
use std::sync::Mutex;

use async_trait::async_trait;

use super::{CommandDef, CommandMode, KitAction, KitIcon, KitManifest, KitResult, ResultKind};

/// SVG icon: minimal 2×2 operator layout (+, ×, −, =) with no outer box.
const ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="5" x2="8" y2="5"/><line x1="5" y1="2" x2="5" y2="8"/><line x1="12" y1="2" x2="18" y2="8"/><line x1="18" y1="2" x2="12" y2="8"/><line x1="2" y1="15" x2="8" y2="15"/><line x1="12" y1="13.5" x2="18" y2="13.5"/><line x1="12" y1="16.5" x2="18" y2="16.5"/></svg>"#;

/// The calculator kit prefix.
const PREFIX: &str = "=";

/// Maximum number of history entries to keep.
const MAX_HISTORY: usize = 20;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/// A past calculation.
#[derive(Debug, Clone)]
struct HistoryEntry {
    expression: String,
    result: String,
}

// ---------------------------------------------------------------------------
// Kit implementation
// ---------------------------------------------------------------------------

/// Evaluates math expressions using the `meval` crate.
///
/// Maintains an in-memory history of recent calculations, shown when the
/// user types just the prefix (`=`) with no expression.
pub struct CalculatorKit {
    manifest: KitManifest,
    history: Mutex<VecDeque<HistoryEntry>>,
}

impl CalculatorKit {
    pub fn new() -> Self {
        Self {
            manifest: KitManifest {
                id: "calculator",
                name: "Calculator",
                description: "Evaluate math expressions",
                icon: Self::icon(),
            },
            history: Mutex::new(VecDeque::new()),
        }
    }

    fn icon() -> KitIcon {
        KitIcon::DataUri(format!("data:image/svg+xml,{}", urlencoding::encode(ICON_SVG)))
    }

    /// Push a calculation to history (most recent first).
    fn record(&self, expression: &str, result: &str) {
        let Ok(mut history) = self.history.lock() else { return };

        // Remove duplicate if same expression already exists.
        history.retain(|e| e.expression != expression);

        history.push_front(HistoryEntry {
            expression: expression.to_string(),
            result: result.to_string(),
        });

        if history.len() > MAX_HISTORY {
            history.pop_back();
        }
    }

    /// Return history entries as kit results.
    fn history_results(&self) -> Vec<KitResult> {
        let Ok(history) = self.history.lock() else {
            return vec![];
        };

        history
            .iter()
            .enumerate()
            .map(|(i, entry)| KitResult {
                id: format!("calc-history-{i}"),
                title: entry.result.clone(),
                subtitle: Some(format_expression(&entry.expression)),
                icon: Some(Self::icon()),
                kind: ResultKind::File, // history entries are plain results, not commands
                accessories: Vec::new(),
                actions: vec![KitAction::Copy { text: entry.result.clone(), label: None }],
                preview: None,
                score: None,
            })
            .collect()
    }
}

impl Default for CalculatorKit {
    fn default() -> Self {
        Self::new()
    }
}

/// The single command ID for calculator search.
const COMMAND_ID: &str = "calculate";

#[async_trait]
impl super::Kit for CalculatorKit {
    fn manifest(&self) -> &KitManifest {
        &self.manifest
    }

    fn commands(&self) -> Vec<CommandDef> {
        vec![CommandDef {
            id: COMMAND_ID,
            name: "Calculator",
            description: "Evaluate math expressions",
            icon: Self::icon(),
            mode: CommandMode::InputResults,
            default_prefix: Some(PREFIX),
            default_hotkey: Some("CmdOrCtrl+Shift+="),
        }]
    }

    fn search(&self, _command_id: &str, query: &str) -> Vec<KitResult> {
        let expr = query.trim();
        if expr.is_empty() {
            return self.history_results();
        }

        evaluate(expr).map_or_else(Vec::new, |result_str| {
            self.record(expr, &result_str);
            vec![KitResult {
                id: "calc-result".to_string(),
                title: result_str.clone(),
                subtitle: Some(format_expression(expr)),
                icon: Some(Self::icon()),
                kind: ResultKind::File,
                accessories: Vec::new(),
                actions: vec![KitAction::Copy { text: result_str, label: None }],
                preview: None,
                score: Some(100),
            }]
        })
    }
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

/// Evaluate a math expression, returning the formatted result or `None`.
fn evaluate(expr: &str) -> Option<String> {
    let value: f64 = meval::eval_str(expr).ok()?;

    if value.is_nan() || value.is_infinite() {
        return None;
    }

    Some(format_number(value))
}

/// Format a number for display: integers show no decimals, floats show
/// up to 10 significant digits.
fn format_number(value: f64) -> String {
    // Safe integer conversion: only cast when the value fits in i64.
    #[allow(clippy::cast_possible_truncation)]
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        // Trim trailing zeros from decimal representation.
        let s = format!("{value:.10}");
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        trimmed.to_string()
    }
}

/// Clean up the expression for display in the subtitle.
fn format_expression(expr: &str) -> String {
    expr.replace('*', "×").replace('/', "÷")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kits::Kit;

    // ── evaluate ────────────────────────────────────────────────

    #[test]
    fn should_evaluate_basic_arithmetic() {
        assert_eq!(evaluate("2+3"), Some("5".to_string()));
        assert_eq!(evaluate("10-4"), Some("6".to_string()));
        assert_eq!(evaluate("3*7"), Some("21".to_string()));
        assert_eq!(evaluate("15/3"), Some("5".to_string()));
    }

    #[test]
    fn should_handle_order_of_operations() {
        assert_eq!(evaluate("2+3*4"), Some("14".to_string()));
        assert_eq!(evaluate("(2+3)*4"), Some("20".to_string()));
    }

    #[test]
    fn should_handle_decimal_results() {
        assert_eq!(evaluate("10/3"), Some("3.3333333333".to_string()));
        assert_eq!(evaluate("1.5+2.5"), Some("4".to_string()));
    }

    #[test]
    fn should_handle_exponents() {
        assert_eq!(evaluate("2^10"), Some("1024".to_string()));
    }

    #[test]
    fn should_handle_math_functions() {
        assert_eq!(evaluate("sqrt(144)"), Some("12".to_string()));
        assert_eq!(evaluate("abs(-5)"), Some("5".to_string()));
    }

    #[test]
    fn should_return_none_for_invalid_expression() {
        assert_eq!(evaluate("hello"), None);
        assert_eq!(evaluate("2+"), None);
        assert_eq!(evaluate(""), None);
    }

    #[test]
    fn should_return_none_for_division_by_zero() {
        // meval returns infinity for 1/0
        assert_eq!(evaluate("1/0"), None);
    }

    // ── format_number ───────────────────────────────────────────

    #[test]
    fn should_format_integers_without_decimals() {
        assert_eq!(format_number(42.0), "42");
        assert_eq!(format_number(-7.0), "-7");
        assert_eq!(format_number(0.0), "0");
    }

    #[test]
    fn should_format_floats_trimming_trailing_zeros() {
        assert_eq!(format_number(3.14), "3.14");
        assert_eq!(format_number(1.5), "1.5");
    }

    // ── format_expression ───────────────────────────────────────

    #[test]
    fn should_replace_operators_for_display() {
        assert_eq!(format_expression("3*4"), "3×4");
        assert_eq!(format_expression("10/2"), "10÷2");
        assert_eq!(format_expression("2+3"), "2+3");
    }

    // ── commands ────────────────────────────────────────────────

    #[test]
    fn exposes_single_calculate_command() {
        let kit = CalculatorKit::new();
        let cmds = kit.commands();
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].id, "calculate");
        assert_eq!(cmds[0].mode, CommandMode::InputResults);
        assert_eq!(cmds[0].default_prefix, Some("="));
    }

    // ── Kit::search ─────────────────────────────────────────────

    #[test]
    fn search_returns_result_for_valid_expression() {
        let kit = CalculatorKit::new();
        let results = kit.search("calculate", "2+3");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "5");
        assert_eq!(results[0].subtitle.as_deref(), Some("2+3"));
    }

    #[test]
    fn search_returns_empty_for_invalid_expression() {
        let kit = CalculatorKit::new();
        assert!(kit.search("calculate", "hello").is_empty());
    }

    #[test]
    fn search_returns_empty_for_empty_query_with_no_history() {
        let kit = CalculatorKit::new();
        assert!(kit.search("calculate", "").is_empty());
        assert!(kit.search("calculate", "   ").is_empty());
    }

    #[test]
    fn search_result_has_copy_action() {
        let kit = CalculatorKit::new();
        let results = kit.search("calculate", "6*7");
        assert_eq!(results.len(), 1);
        match &results[0].actions[0] {
            KitAction::Copy { text, .. } => assert_eq!(text, "42"),
            other => panic!("expected Copy action, got {other:?}"),
        }
    }

    // ── History ─────────────────────────────────────────────────

    #[test]
    fn search_records_history_and_shows_on_empty_query() {
        let kit = CalculatorKit::new();

        // Evaluate some expressions
        kit.search("calculate", "2+3");
        kit.search("calculate", "6*7");

        // Empty query returns history, most recent first
        let history = kit.search("calculate", "");
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].title, "42");
        assert_eq!(history[1].title, "5");
    }

    #[test]
    fn history_deduplicates_same_expression() {
        let kit = CalculatorKit::new();

        kit.search("calculate", "2+3");
        kit.search("calculate", "6*7");
        kit.search("calculate", "2+3"); // duplicate — should move to front, not add twice

        let history = kit.search("calculate", "");
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].title, "5"); // 2+3 is now most recent
        assert_eq!(history[1].title, "42");
    }

    #[test]
    fn history_entries_have_copy_action() {
        let kit = CalculatorKit::new();
        kit.search("calculate", "2+3");

        let history = kit.search("calculate", "");
        assert_eq!(history.len(), 1);
        match &history[0].actions[0] {
            KitAction::Copy { text, .. } => assert_eq!(text, "5"),
            other => panic!("expected Copy action, got {other:?}"),
        }
    }

    #[test]
    fn history_respects_max_size() {
        let kit = CalculatorKit::new();

        // Fill beyond MAX_HISTORY
        for i in 0..25 {
            kit.search("calculate", &format!("{i}+1"));
        }

        let history = kit.search("calculate", "");
        assert!(history.len() <= MAX_HISTORY);
    }

    #[test]
    fn invalid_expressions_are_not_recorded() {
        let kit = CalculatorKit::new();

        kit.search("calculate", "2+3");
        kit.search("calculate", "invalid");
        kit.search("calculate", "hello world");

        let history = kit.search("calculate", "");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].title, "5");
    }
}
