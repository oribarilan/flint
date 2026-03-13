//! LLM provider abstraction.
//!
//! Defines the [`Provider`] trait that all LLM backends implement (`Copilot`,
//! `OpenAI`, `Anthropic`, etc.). Copilot is the first; others can be added by
//! implementing the same trait.

pub mod copilot;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Chat types shared across all providers
// ---------------------------------------------------------------------------

/// A role in a chat conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    /// Message from the system / instructions.
    System,
    /// Message from the user.
    User,
    /// Message from the assistant / model.
    Assistant,
    /// Result of a tool invocation.
    Tool,
}

/// A single message in a chat conversation.
///
/// Supports the OpenAI-compatible chat completions format including tool calls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// Who sent the message.
    pub role: ChatRole,
    /// Message content. `None` when the assistant responds with only tool calls.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Tool calls requested by the assistant.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// ID of the tool call this message is a response to (role = tool).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    /// Create a simple text message (user, assistant, or system).
    pub fn text(role: ChatRole, content: impl Into<String>) -> Self {
        Self { role, content: Some(content.into()), tool_calls: None, tool_call_id: None }
    }

    /// Create an assistant message containing tool calls (no text content).
    pub const fn assistant_tool_calls(calls: Vec<ToolCall>) -> Self {
        Self {
            role: ChatRole::Assistant,
            content: None,
            tool_calls: Some(calls),
            tool_call_id: None,
        }
    }

    /// Create a tool result message.
    pub fn tool_result(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::Tool,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
        }
    }
}

/// A tool call requested by the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Unique ID for this call (used to match results).
    pub id: String,
    /// Always `"function"` for OpenAI-compatible APIs.
    #[serde(rename = "type")]
    pub call_type: String,
    /// The function to call.
    pub function: FunctionCall,
}

/// Function name and arguments within a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    /// Function name (e.g., `"calculate"`).
    pub name: String,
    /// JSON-encoded arguments string.
    pub arguments: String,
}

/// Authentication status for a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    /// Whether the provider has valid credentials.
    pub authenticated: bool,
    /// Display name / username, if available.
    pub username: Option<String>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_message_serializes_without_tool_fields() {
        let msg = ChatMessage::text(ChatRole::User, "hello");
        let json = serde_json::to_value(&msg).unwrap();

        assert_eq!(json["role"], "user");
        assert_eq!(json["content"], "hello");
        // tool_calls and tool_call_id should be omitted (skip_serializing_if)
        assert!(json.get("tool_calls").is_none());
        assert!(json.get("tool_call_id").is_none());
    }

    #[test]
    fn assistant_tool_calls_serializes_correctly() {
        let msg = ChatMessage::assistant_tool_calls(vec![ToolCall {
            id: "call_1".to_string(),
            call_type: "function".to_string(),
            function: FunctionCall {
                name: "calculate".to_string(),
                arguments: r#"{"expression":"2+3"}"#.to_string(),
            },
        }]);
        let json = serde_json::to_value(&msg).unwrap();

        assert_eq!(json["role"], "assistant");
        assert!(json.get("content").is_none());
        assert!(json["tool_calls"].is_array());
        assert_eq!(json["tool_calls"][0]["id"], "call_1");
        assert_eq!(json["tool_calls"][0]["function"]["name"], "calculate");
    }

    #[test]
    fn tool_result_serializes_with_tool_call_id() {
        let msg = ChatMessage::tool_result("call_1", r#"{"result":"5"}"#);
        let json = serde_json::to_value(&msg).unwrap();

        assert_eq!(json["role"], "tool");
        assert_eq!(json["content"], r#"{"result":"5"}"#);
        assert_eq!(json["tool_call_id"], "call_1");
        assert!(json.get("tool_calls").is_none());
    }

    #[test]
    fn tool_call_type_serializes_as_type() {
        let tc = ToolCall {
            id: "call_1".to_string(),
            call_type: "function".to_string(),
            function: FunctionCall { name: "test".to_string(), arguments: "{}".to_string() },
        };
        let json = serde_json::to_value(&tc).unwrap();
        // call_type is renamed to "type" via serde
        assert_eq!(json["type"], "function");
        assert!(json.get("call_type").is_none());
    }
}
