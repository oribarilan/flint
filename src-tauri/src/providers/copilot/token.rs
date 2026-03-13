//! Copilot token storage and refresh logic.
//!
//! Manages two credentials:
//! - **GitHub access token** — long-lived, stored via [`credential_store`](super::credential_store).
//! - **Copilot API token** — short-lived (~30 min), cached in memory + credential store.

use std::sync::Arc;

use tokio::sync::RwLock;

use super::auth::{self, CopilotToken};
use super::credential_store;

const GITHUB_TOKEN_KEY: &str = "github_access_token";
const COPILOT_TOKEN_KEY: &str = "copilot_token";

/// Buffer in seconds before `expires_at` to trigger a proactive refresh.
const REFRESH_BUFFER_SECS: i64 = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Token-management errors.
#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    /// No stored credentials — user must sign in.
    #[error("not authenticated")]
    NotAuthenticated,
    /// The Copilot token refresh failed.
    #[error("token refresh failed: {0}")]
    RefreshFailed(String),
    /// A credential storage operation failed.
    #[error("storage error: {0}")]
    Storage(String),
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct TokenState {
    github_token: Option<String>,
    copilot_token: Option<CopilotToken>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Manages token lifecycle: storage, retrieval, and automatic refresh.
#[derive(Debug)]
pub struct TokenManager {
    client: reqwest::Client,
    state: Arc<RwLock<TokenState>>,
}

impl TokenManager {
    /// Create a new manager, loading any persisted tokens from the credential store.
    pub fn new(client: reqwest::Client) -> Self {
        let github_token = credential_store::load(GITHUB_TOKEN_KEY);
        let copilot_token = credential_store::load(COPILOT_TOKEN_KEY)
            .and_then(|json| serde_json::from_str::<CopilotToken>(&json).ok());

        let state = TokenState { github_token, copilot_token };

        Self { client, state: Arc::new(RwLock::new(state)) }
    }

    /// Persist a GitHub access token after a successful device-flow auth.
    pub async fn store_github_token(&self, token: &str) -> Result<(), TokenError> {
        credential_store::save(GITHUB_TOKEN_KEY, token).map_err(TokenError::Storage)?;
        self.state.write().await.github_token = Some(token.to_owned());
        tracing::info!("github access token stored");
        Ok(())
    }

    /// Persist a Copilot token after a successful exchange.
    pub async fn store_copilot_token(&self, token: CopilotToken) -> Result<(), TokenError> {
        let json = serde_json::to_string(&token).map_err(|e| TokenError::Storage(e.to_string()))?;
        credential_store::save(COPILOT_TOKEN_KEY, &json).map_err(TokenError::Storage)?;
        self.state.write().await.copilot_token = Some(token);
        tracing::info!("copilot token stored");
        Ok(())
    }

    /// Get a valid Copilot API token and endpoint URL.
    ///
    /// Automatically refreshes if the token is expired or near-expiry.
    /// Returns `(bearer_token, endpoint_url)`.
    pub async fn get_valid_token(&self) -> Result<(String, String), TokenError> {
        // Fast path — token still valid.
        {
            let state = self.state.read().await;
            if let Some(ct) = &state.copilot_token {
                if !is_expired(ct) {
                    return Ok((ct.token.clone(), ct.endpoints.api.clone()));
                }
            }
        }

        // Need a refresh.
        self.refresh_copilot_token().await
    }

    /// Whether there are stored credentials (GitHub token present).
    pub async fn is_authenticated(&self) -> bool {
        let state = self.state.read().await;
        state.github_token.is_some()
    }

    /// Clear all stored tokens (sign out).
    pub async fn sign_out(&self) {
        credential_store::delete(GITHUB_TOKEN_KEY);
        credential_store::delete(COPILOT_TOKEN_KEY);
        *self.state.write().await = TokenState::default();
        tracing::info!("signed out — all tokens cleared");
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    /// Exchange the stored GitHub token for a fresh Copilot token.
    async fn refresh_copilot_token(&self) -> Result<(String, String), TokenError> {
        let github_token = {
            let state = self.state.read().await;
            state.github_token.clone().ok_or(TokenError::NotAuthenticated)?
        };

        tracing::info!("refreshing copilot token");
        let ct = auth::exchange_for_copilot_token(&self.client, &github_token)
            .await
            .map_err(|e| TokenError::RefreshFailed(e.to_string()))?;

        let result = (ct.token.clone(), ct.endpoints.api.clone());
        self.store_copilot_token(ct).await?;
        Ok(result)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Check whether a Copilot token is expired or within the refresh buffer.
fn is_expired(token: &CopilotToken) -> bool {
    let now = chrono::Utc::now().timestamp();
    token.expires_at - REFRESH_BUFFER_SECS <= now
}
