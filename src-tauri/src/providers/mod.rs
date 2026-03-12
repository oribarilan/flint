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
}

/// A single message in a chat conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// Who sent the message.
    pub role: ChatRole,
    /// Message content.
    pub content: String,
}

/// Authentication status for a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    /// Whether the provider has valid credentials.
    pub authenticated: bool,
    /// Display name / username, if available.
    pub username: Option<String>,
}
