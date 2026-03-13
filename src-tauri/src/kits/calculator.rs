//! Calculator kit — evaluate math expressions inline.
//!
//! Activated by the `=` prefix: `= 2+3` → `5`.
//! Also exposes a `calculate` chat tool for the AI.

use async_trait::async_trait;

use super::{ChatToolDef, KitAction, KitError, KitIcon, KitManifest, KitResult, SearchTrigger};

/// SVG icon: minimal 2×2 operator layout (+, ×, −, =) with no outer box.
const ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="5" x2="8" y2="5"/><line x1="5" y1="2" x2="5" y2="8"/><line x1="12" y1="2" x2="18" y2="8"/><line x1="18" y1="2" x2="12" y2="8"/><line x1="2" y1="15" x2="8" y2="15"/><line x1="12" y1="13.5" x2="18" y2="13.5"/><line x1="12" y1="16.5" x2="18" y2="16.5"/></svg>"#;

/// The calculator kit prefix.
const PREFIX: &str = "=";

// ---------------------------------------------------------------------------
// Kit implementation
// ---------------------------------------------------------------------------

/// Evaluates math expressions using the `meval` crate.
pub struct CalculatorKit {
    manifest: KitManifest,
    trigger: SearchTrigger,
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
            trigger: SearchTrigger::Prefix(PREFIX),
        }
    }

    fn icon() -> KitIcon {
        KitIcon::DataUri(format!("data:image/svg+xml,{}", urlencoding::encode(ICON_SVG)))
    }
}

impl Default for CalculatorKit {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl super::Kit for CalculatorKit {
    fn manifest(&self) -> &KitManifest {
        &self.manifest
    }

    fn search_trigger(&self) -> Option<&SearchTrigger> {
        Some(&self.trigger)
    }

    fn search(&self, query: &str) -> Vec<KitResult> {
        let expr = query.trim();
        if expr.is_empty() {
            return vec![];
        }

        evaluate(expr).map_or_else(Vec::new, |result_str| {
            vec![KitResult {
                id: "calc-result".to_string(),
                title: result_str.clone(),
                subtitle: Some(format_expression(expr)),
                icon: Some(Self::icon()),
                accessories: Vec::new(),
                actions: vec![KitAction::Copy { text: result_str, label: None }],
                preview: None,
                score: Some(100),
            }]
        })
    }

    fn chat_tools(&self) -> Vec<ChatToolDef> {
        vec![ChatToolDef {
            name: "calculate".to_string(),
            description: "Evaluate a mathematical expression. Supports +, -, *, /, ^, parentheses, and common functions (sin, cos, sqrt, abs, ln, log, etc.).".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "The math expression to evaluate, e.g. '2+3', 'sqrt(144)', '(5+3)*2'"
                    }
                },
                "required": ["expression"]
            }),
        }]
    }

    async fn invoke_chat_tool(
        &self,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, KitError> {
        if tool_name != "calculate" {
            return Err(KitError::ToolNotFound(tool_name.to_string()));
        }

        let expr = args
            .get("expression")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KitError::Internal("missing 'expression' parameter".to_string()))?;

        evaluate(expr).map_or_else(
            || Ok(serde_json::json!({ "error": "invalid expression", "expression": expr })),
            |result| Ok(serde_json::json!({ "result": result, "expression": expr })),
        )
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

    // ── Kit::search ─────────────────────────────────────────────

    #[test]
    fn search_returns_result_for_valid_expression() {
        let kit = CalculatorKit::new();
        let results = kit.search("2+3");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "5");
        assert_eq!(results[0].subtitle.as_deref(), Some("2+3"));
    }

    #[test]
    fn search_returns_empty_for_invalid_expression() {
        let kit = CalculatorKit::new();
        assert!(kit.search("hello").is_empty());
    }

    #[test]
    fn search_returns_empty_for_empty_query() {
        let kit = CalculatorKit::new();
        assert!(kit.search("").is_empty());
        assert!(kit.search("   ").is_empty());
    }

    #[test]
    fn search_result_has_copy_action() {
        let kit = CalculatorKit::new();
        let results = kit.search("6*7");
        assert_eq!(results.len(), 1);
        match &results[0].actions[0] {
            KitAction::Copy { text, .. } => assert_eq!(text, "42"),
            other => panic!("expected Copy action, got {other:?}"),
        }
    }

    // ── Kit::invoke_chat_tool ───────────────────────────────────

    #[tokio::test]
    async fn chat_tool_evaluates_expression() {
        let kit = CalculatorKit::new();
        let result = kit
            .invoke_chat_tool("calculate", serde_json::json!({ "expression": "2+3" }))
            .await
            .unwrap();

        assert_eq!(result["result"], "5");
    }

    #[tokio::test]
    async fn chat_tool_returns_error_for_invalid() {
        let kit = CalculatorKit::new();
        let result = kit
            .invoke_chat_tool("calculate", serde_json::json!({ "expression": "invalid" }))
            .await
            .unwrap();

        assert_eq!(result["error"], "invalid expression");
    }

    #[tokio::test]
    async fn chat_tool_rejects_unknown_tool() {
        let kit = CalculatorKit::new();
        let result: Result<serde_json::Value, KitError> =
            kit.invoke_chat_tool("unknown", serde_json::json!({})).await;

        assert!(result.is_err());
    }
}
