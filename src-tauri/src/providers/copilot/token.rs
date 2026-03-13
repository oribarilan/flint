//! Copilot token storage (keychain) and refresh logic.
//!
//! Manages two credentials:
//! - **GitHub access token** — long-lived, stored in OS keychain.
//! - **Copilot API token** — short-lived (~30 min), cached in memory + keychain.

use std::sync::Arc;

use tokio::sync::RwLock;

use super::auth::{self, CopilotToken};

const KEYRING_SERVICE: &str = "sh.oribi.flint";
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
    /// An OS keychain operation failed.
    #[error("keychain error: {0}")]
    Keychain(String),
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
    /// Create a new manager, loading any persisted tokens from the keychain.
    pub fn new(client: reqwest::Client) -> Self {
        let github_token = load_from_keychain(GITHUB_TOKEN_KEY);
        let copilot_token = load_from_keychain(COPILOT_TOKEN_KEY)
            .and_then(|json| serde_json::from_str::<CopilotToken>(&json).ok());

        let state = TokenState { github_token, copilot_token };

        Self { client, state: Arc::new(RwLock::new(state)) }
    }

    /// Persist a GitHub access token after a successful device-flow auth.
    pub async fn store_github_token(&self, token: &str) -> Result<(), TokenError> {
        save_to_keychain(GITHUB_TOKEN_KEY, token)?;
        self.state.write().await.github_token = Some(token.to_owned());
        tracing::info!("github access token stored");
        Ok(())
    }

    /// Persist a Copilot token after a successful exchange.
    pub async fn store_copilot_token(&self, token: CopilotToken) -> Result<(), TokenError> {
        let json =
            serde_json::to_string(&token).map_err(|e| TokenError::Keychain(e.to_string()))?;
        save_to_keychain(COPILOT_TOKEN_KEY, &json)?;
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
        delete_from_keychain(GITHUB_TOKEN_KEY);
        delete_from_keychain(COPILOT_TOKEN_KEY);
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

/// Load a value from the OS keychain. Returns `None` on any failure.
fn load_from_keychain(key: &str) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, key).ok().and_then(|entry| entry.get_password().ok())
}

/// Save a value to the OS keychain.
fn save_to_keychain(key: &str, value: &str) -> Result<(), TokenError> {
    keyring::Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| TokenError::Keychain(e.to_string()))?
        .set_password(value)
        .map_err(|e| TokenError::Keychain(e.to_string()))
}

/// Delete a value from the OS keychain. Silently ignores errors.
fn delete_from_keychain(key: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, key) {
        let _ = entry.delete_credential();
    }
}
