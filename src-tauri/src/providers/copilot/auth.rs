//! OAuth Device Flow for GitHub Copilot authentication.
//!
//! Implements the three-step flow:
//! 1. Request a device code from GitHub.
//! 2. Poll for the GitHub access token while the user authorises in-browser.
//! 3. Exchange the GitHub token for a short-lived Copilot API token.

use serde::{Deserialize, Serialize};

const GITHUB_COPILOT_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";
const GITHUB_COPILOT_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_COPILOT_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_COPILOT_API_KEY_URL: &str = "https://api.github.com/copilot_internal/v2/token";
const USER_AGENT: &str = "Flint/0.1.0";

// RFC 8628 §3.2: add 5 seconds when the server responds with `slow_down`.
const SLOW_DOWN_EXTRA_SECONDS: u64 = 5;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Response from the device code request (step 1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    /// One-time code the device uses when polling for the access token.
    pub device_code: String,
    /// Short code the user enters on the verification page.
    pub user_code: String,
    /// URL where the user authorises the device.
    pub verification_uri: String,
    /// Minimum polling interval in seconds.
    pub interval: u64,
}

/// Copilot API token with endpoint info (step 3 response).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotToken {
    /// The short-lived Copilot API bearer token.
    pub token: String,
    /// Unix timestamp when the token expires.
    pub expires_at: i64,
    /// Copilot endpoint metadata.
    pub endpoints: CopilotEndpoints,
}

/// Endpoint URLs returned alongside a Copilot token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotEndpoints {
    /// Base URL for the Copilot chat completions API.
    pub api: String,
}

/// Errors specific to the Copilot auth flow.
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    /// The initial device code request failed.
    #[error("device code request failed: {0}")]
    DeviceCodeFailed(String),
    /// Polling for the access token failed unexpectedly.
    #[error("token polling failed: {0}")]
    PollingFailed(String),
    /// The device code expired or the user denied authorisation.
    #[error("auth expired or denied")]
    ExpiredOrDenied,
    /// Exchanging the GitHub token for a Copilot token failed.
    #[error("copilot token exchange failed: {0}")]
    TokenExchangeFailed(String),
    /// An underlying network / HTTP error from `reqwest`.
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
}

// ---------------------------------------------------------------------------
// Internal response shapes
// ---------------------------------------------------------------------------

/// Raw JSON body returned by the access-token polling endpoint.
#[derive(Debug, Deserialize)]
struct PollResponse {
    access_token: Option<String>,
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Step 1: Request a device code from GitHub.
///
/// Returns a [`DeviceCodeResponse`] containing the `user_code` and
/// `verification_uri` the caller should present to the user.
pub async fn request_device_code(
    client: &reqwest::Client,
) -> Result<DeviceCodeResponse, AuthError> {
    tracing::info!("requesting device code from GitHub");

    let body = serde_json::json!({
        "client_id": GITHUB_COPILOT_CLIENT_ID,
        "scope": "read:user",
    });

    let resp = client
        .post(GITHUB_COPILOT_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", USER_AGENT)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AuthError::DeviceCodeFailed(format!("HTTP {status}: {text}")));
    }

    let device_code: DeviceCodeResponse =
        resp.json().await.map_err(|e| AuthError::DeviceCodeFailed(e.to_string()))?;

    tracing::info!(
        user_code = %device_code.user_code,
        verification_uri = %device_code.verification_uri,
        "device code received — waiting for user authorisation"
    );

    Ok(device_code)
}

/// Step 2: Poll for the GitHub access token.
///
/// Blocks (async) until the user completes authorisation, the code expires,
/// or an unrecoverable error occurs.
pub async fn poll_for_access_token(
    client: &reqwest::Client,
    device_code: &str,
    interval: u64,
) -> Result<String, AuthError> {
    let mut interval_secs = interval;

    let body = serde_json::json!({
        "client_id": GITHUB_COPILOT_CLIENT_ID,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
    });

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;
        tracing::debug!(interval_secs, "polling for access token");

        let resp = client
            .post(GITHUB_COPILOT_ACCESS_TOKEN_URL)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("User-Agent", USER_AGENT)
            .json(&body)
            .send()
            .await?;

        let poll: PollResponse =
            resp.json().await.map_err(|e| AuthError::PollingFailed(e.to_string()))?;

        if let Some(token) = poll.access_token {
            tracing::info!("GitHub access token obtained");
            return Ok(token);
        }

        match poll.error.as_deref() {
            Some("authorization_pending") => {}
            Some("slow_down") => {
                interval_secs += SLOW_DOWN_EXTRA_SECONDS;
                tracing::debug!(interval_secs, "slow_down received — increasing interval");
            }
            Some("expired_token" | "access_denied") => {
                return Err(AuthError::ExpiredOrDenied);
            }
            Some(other) => {
                return Err(AuthError::PollingFailed(other.to_string()));
            }
            None => {
                return Err(AuthError::PollingFailed(
                    "response contained neither access_token nor error".into(),
                ));
            }
        }
    }
}

/// Step 3: Exchange a GitHub access token for a Copilot API token.
///
/// The returned [`CopilotToken`] is short-lived; callers should cache it and
/// refresh before `expires_at`.
pub async fn exchange_for_copilot_token(
    client: &reqwest::Client,
    github_token: &str,
) -> Result<CopilotToken, AuthError> {
    tracing::info!("exchanging GitHub token for Copilot API token");

    let resp = client
        .get(GITHUB_COPILOT_API_KEY_URL)
        .header("Accept", "application/json")
        .header("Authorization", format!("token {github_token}"))
        .header("User-Agent", USER_AGENT)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AuthError::TokenExchangeFailed(format!("HTTP {status}: {text}")));
    }

    let copilot_token: CopilotToken =
        resp.json().await.map_err(|e| AuthError::TokenExchangeFailed(e.to_string()))?;

    tracing::info!("copilot token obtained successfully");
    Ok(copilot_token)
}
