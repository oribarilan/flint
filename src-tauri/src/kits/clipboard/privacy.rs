//! Privacy filters for clipboard content.
//!
//! Three layers of protection:
//! 1. **Excluded apps** — skip content from user-configured apps.
//! 2. **Secret-like detection** — heuristic detection of passwords, tokens, keys.
//! 3. **False-positive exclusions** — avoid flagging UUIDs, colors, etc.

use std::collections::HashSet;

// ---------------------------------------------------------------------------
// Excluded apps
// ---------------------------------------------------------------------------

/// Check if the source app is in the excluded list (case-insensitive).
pub fn is_excluded_app(source_app: Option<&str>, excluded_apps: &[String]) -> bool {
    let Some(app) = source_app else { return false };
    let app_lower = app.to_lowercase();
    excluded_apps.iter().any(|excluded| app_lower.contains(&excluded.to_lowercase()))
}

// ---------------------------------------------------------------------------
// Secret-like content detection
// ---------------------------------------------------------------------------

/// Returns `true` if the content looks like a password, API key, or token.
///
/// False-positive exclusions are checked first — UUIDs, hex color codes, and
/// recognizable base64 structures are explicitly allowed.
pub fn looks_like_secret(content: &str) -> bool {
    let trimmed = content.trim();

    if trimmed.is_empty() || trimmed.len() > 500 {
        // Very long strings are unlikely to be individual secrets.
        // Empty strings are not secrets.
        return false;
    }

    // Check false-positive exclusions first.
    if is_known_safe_pattern(trimmed) {
        return false;
    }

    // Check known token patterns.
    if matches_token_pattern(trimmed) {
        return true;
    }

    // Check password-like strings.
    if looks_like_password(trimmed) {
        return true;
    }

    // Check high-entropy short strings.
    if trimmed.len() < 100 && shannon_entropy(trimmed) > 4.0 {
        // Additional check: high entropy alone isn't enough — must also look
        // "random" (no spaces, mostly alphanumeric + symbols).
        let has_spaces = trimmed.contains(' ');
        let mostly_ascii = trimmed.chars().all(|c| c.is_ascii_graphic());
        if !has_spaces && mostly_ascii {
            return true;
        }
    }

    false
}

// ---------------------------------------------------------------------------
// False-positive exclusions
// ---------------------------------------------------------------------------

/// Patterns that commonly trigger entropy/pattern checks but aren't secrets.
fn is_known_safe_pattern(s: &str) -> bool {
    is_uuid(s) || is_hex_color(s) || is_data_uri(s) || is_file_path(s) || is_url(s)
}

/// UUID / GUID: `550e8400-e29b-41d4-a716-446655440000`
fn is_uuid(s: &str) -> bool {
    // 8-4-4-4-12 hex pattern
    if s.len() != 36 {
        return false;
    }
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 5 {
        return false;
    }
    let expected_lens = [8, 4, 4, 4, 12];
    parts
        .iter()
        .zip(expected_lens.iter())
        .all(|(part, &len)| part.len() == len && part.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Hex color code: `#FFF`, `#FF5733`, `#FF5733AA`
fn is_hex_color(s: &str) -> bool {
    if !s.starts_with('#') {
        return false;
    }
    let hex = &s[1..];
    matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

/// Data URI: `data:image/png;base64,...`
fn is_data_uri(s: &str) -> bool {
    s.starts_with("data:")
}

/// File path: starts with `/` or `~` or a Windows drive letter.
fn is_file_path(s: &str) -> bool {
    s.starts_with('/')
        || s.starts_with('~')
        || (s.len() >= 3
            && s.as_bytes()[1] == b':'
            && (s.as_bytes()[2] == b'\\' || s.as_bytes()[2] == b'/'))
}

/// URL: starts with a common scheme.
fn is_url(s: &str) -> bool {
    s.starts_with("http://")
        || s.starts_with("https://")
        || s.starts_with("ftp://")
        || s.starts_with("ssh://")
        || s.starts_with("file://")
}

// ---------------------------------------------------------------------------
// Token pattern matching
// ---------------------------------------------------------------------------

/// Known token/key prefixes and patterns.
fn matches_token_pattern(s: &str) -> bool {
    static PREFIXES: &[&str] = &[
        "ghp_",        // GitHub personal access token
        "gho_",        // GitHub OAuth token
        "ghs_",        // GitHub server token
        "ghu_",        // GitHub user token
        "github_pat_", // GitHub fine-grained PAT
        "sk-",         // OpenAI / Stripe secret key
        "pk_",         // Stripe publishable key
        "Bearer ",     // Bearer token
        "AKIA",        // AWS access key
        "sk_live_",    // Stripe live key
        "sk_test_",    // Stripe test key
        "xox",         // Slack token variants
    ];

    // Check known prefixes.
    if PREFIXES.iter().any(|prefix| s.starts_with(prefix)) {
        return true;
    }

    // JWT: `eyJ` prefix with two dots.
    if s.starts_with("eyJ") && s.chars().filter(|&c| c == '.').count() == 2 {
        return true;
    }

    // Long hex strings (32+ chars, all hex) — potential hashes/keys.
    if s.len() >= 32
        && s.chars().all(|c| c.is_ascii_hexdigit())
        && s.chars().any(|c| c.is_ascii_digit())
        && s.chars().any(|c| c.is_ascii_alphabetic())
    {
        return true;
    }

    false
}

// ---------------------------------------------------------------------------
// Password detection
// ---------------------------------------------------------------------------

/// Heuristic: looks like a password — mixed case + digits + symbols, no spaces.
fn looks_like_password(s: &str) -> bool {
    let len = s.len();
    if !(8..=64).contains(&len) {
        return false;
    }
    if s.contains(' ') {
        return false;
    }

    let mut char_classes = HashSet::new();
    for c in s.chars() {
        if c.is_ascii_uppercase() {
            char_classes.insert("upper");
        } else if c.is_ascii_lowercase() {
            char_classes.insert("lower");
        } else if c.is_ascii_digit() {
            char_classes.insert("digit");
        } else if c.is_ascii_punctuation() {
            char_classes.insert("symbol");
        }
    }

    // Must have at least 3 of 4 character classes to look password-like.
    char_classes.len() >= 3
}

// ---------------------------------------------------------------------------
// Entropy
// ---------------------------------------------------------------------------

/// Calculate Shannon entropy in bits per character.
fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }

    #[allow(clippy::cast_precision_loss)] // strings < 500 chars — no precision issue
    let len = s.len() as f64;
    let mut freq = [0u32; 256];
    for &b in s.as_bytes() {
        freq[b as usize] += 1;
    }

    freq.iter()
        .filter(|&&count| count > 0)
        .map(|&count| {
            let p = f64::from(count) / len;
            -p * p.log2()
        })
        .sum()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_excluded_app ─────────────────────────────────────────

    #[test]
    fn should_match_excluded_app_case_insensitive() {
        let excluded = vec!["1Password".to_string()];
        assert!(is_excluded_app(Some("1Password"), &excluded));
        assert!(is_excluded_app(Some("1password"), &excluded));
        assert!(is_excluded_app(Some("1PASSWORD"), &excluded));
    }

    #[test]
    fn should_match_partial_app_name() {
        let excluded = vec!["Bitwarden".to_string()];
        assert!(is_excluded_app(Some("Bitwarden Desktop"), &excluded));
    }

    #[test]
    fn should_not_match_non_excluded_app() {
        let excluded = vec!["1Password".to_string()];
        assert!(!is_excluded_app(Some("VS Code"), &excluded));
    }

    #[test]
    fn should_return_false_for_no_source_app() {
        let excluded = vec!["1Password".to_string()];
        assert!(!is_excluded_app(None, &excluded));
    }

    #[test]
    fn should_return_false_for_empty_excluded_list() {
        assert!(!is_excluded_app(Some("Any App"), &[]));
    }

    // ── is_uuid ─────────────────────────────────────────────────

    #[test]
    fn should_recognize_valid_uuid() {
        assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_uuid("123e4567-e89b-12d3-a456-426614174000"));
    }

    #[test]
    fn should_reject_invalid_uuid() {
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("550e8400-e29b-41d4-a716"));
        assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000g"));
    }

    // ── is_hex_color ────────────────────────────────────────────

    #[test]
    fn should_recognize_hex_colors() {
        assert!(is_hex_color("#FFF"));
        assert!(is_hex_color("#FF5733"));
        assert!(is_hex_color("#FF5733AA"));
        assert!(is_hex_color("#fff"));
    }

    #[test]
    fn should_reject_non_hex_colors() {
        assert!(!is_hex_color("FF5733"));
        assert!(!is_hex_color("#GGG"));
        assert!(!is_hex_color("#12345"));
    }

    // ── matches_token_pattern ───────────────────────────────────

    #[test]
    fn should_detect_github_tokens() {
        assert!(matches_token_pattern("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"));
        assert!(matches_token_pattern("gho_sometoken123"));
        assert!(matches_token_pattern("github_pat_somethinglong"));
    }

    #[test]
    fn should_detect_openai_stripe_tokens() {
        assert!(matches_token_pattern("sk-proj-abc123"));
        assert!(matches_token_pattern("sk_live_abc123"));
        assert!(matches_token_pattern("pk_test_abc123"));
    }

    #[test]
    fn should_detect_bearer_tokens() {
        assert!(matches_token_pattern("Bearer eyJhbGciOiJIUzI1NiJ9"));
    }

    #[test]
    fn should_detect_aws_keys() {
        assert!(matches_token_pattern("AKIAIOSFODNN7EXAMPLE"));
    }

    #[test]
    fn should_detect_jwt_tokens() {
        assert!(matches_token_pattern(
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
        ));
    }

    #[test]
    fn should_detect_long_hex_strings() {
        assert!(matches_token_pattern("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"));
    }

    #[test]
    fn should_not_flag_normal_text() {
        assert!(!matches_token_pattern("Hello, world!"));
        assert!(!matches_token_pattern("just some text"));
    }

    // ── looks_like_password ─────────────────────────────────────

    #[test]
    fn should_detect_password_like_strings() {
        assert!(looks_like_password("P@ssw0rd!"));
        assert!(looks_like_password("MyS3cret#Key"));
        assert!(looks_like_password("Tr0ub4dor&3"));
    }

    #[test]
    fn should_not_flag_simple_words() {
        assert!(!looks_like_password("hello"));
        assert!(!looks_like_password("alllowercase"));
        assert!(!looks_like_password("ALLUPPERCASE"));
    }

    #[test]
    fn should_not_flag_strings_with_spaces() {
        assert!(!looks_like_password("correct horse battery staple"));
    }

    #[test]
    fn should_not_flag_too_short_strings() {
        assert!(!looks_like_password("Ab1!"));
    }

    #[test]
    fn should_not_flag_too_long_strings() {
        let long = "A1!".repeat(30);
        assert!(!looks_like_password(&long));
    }

    // ── looks_like_secret (integration) ─────────────────────────

    #[test]
    fn should_not_flag_uuid_as_secret() {
        assert!(!looks_like_secret("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn should_not_flag_hex_color_as_secret() {
        assert!(!looks_like_secret("#FF5733AA"));
        assert!(!looks_like_secret("#FFF"));
    }

    #[test]
    fn should_not_flag_data_uri_as_secret() {
        assert!(!looks_like_secret("data:image/png;base64,iVBORw0KGgo="));
    }

    #[test]
    fn should_not_flag_normal_sentences() {
        assert!(!looks_like_secret("Hello, world!"));
        assert!(!looks_like_secret("The quick brown fox jumps over the lazy dog."));
    }

    #[test]
    fn should_not_flag_empty_string() {
        assert!(!looks_like_secret(""));
    }

    #[test]
    fn should_flag_github_token() {
        assert!(looks_like_secret("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"));
    }

    #[test]
    fn should_flag_password_like_content() {
        assert!(looks_like_secret("P@ssw0rd!2024"));
    }

    #[test]
    fn should_not_flag_urls() {
        assert!(!looks_like_secret("https://github.com/user/repo"));
    }

    #[test]
    fn should_not_flag_file_paths() {
        assert!(!looks_like_secret("/Users/john/Documents/file.txt"));
    }

    // ── shannon_entropy ─────────────────────────────────────────

    #[test]
    #[allow(clippy::float_cmp)] // exact zero is expected for empty input
    fn should_return_zero_entropy_for_empty_string() {
        assert_eq!(shannon_entropy(""), 0.0);
    }

    #[test]
    #[allow(clippy::float_cmp)] // exact zero is expected for single-char repeat
    fn should_return_zero_entropy_for_single_char_repeat() {
        assert_eq!(shannon_entropy("aaaa"), 0.0);
    }

    #[test]
    fn should_return_higher_entropy_for_varied_content() {
        let low = shannon_entropy("aaaa");
        let high = shannon_entropy("a1B!xY9z");
        assert!(high > low);
    }

    // ── looks_like_secret: edge cases ───────────────────────────

    #[test]
    fn should_not_flag_whitespace_only() {
        assert!(!looks_like_secret("   "));
        assert!(!looks_like_secret("\t\n"));
    }

    #[test]
    fn should_not_flag_multiline_normal_text() {
        assert!(!looks_like_secret("line one\nline two\nline three"));
    }

    #[test]
    fn should_not_flag_unicode_text() {
        assert!(!looks_like_secret("こんにちは世界"));
        assert!(!looks_like_secret("café au lait"));
        assert!(!looks_like_secret("🎉🎊🎈 party time!"));
    }

    #[test]
    fn should_not_flag_windows_file_path() {
        assert!(!looks_like_secret("C:\\Users\\john\\Documents\\file.txt"));
    }

    #[test]
    fn should_not_flag_various_url_schemes() {
        assert!(!looks_like_secret("http://example.com"));
        assert!(!looks_like_secret("ftp://files.example.com/data"));
        assert!(!looks_like_secret("ssh://git@github.com/repo"));
    }

    // ── looks_like_password: boundary tests ─────────────────────

    #[test]
    fn should_not_flag_7_char_password_like() {
        // 7 chars: below the 8-char minimum.
        assert!(!looks_like_password("Ab1!xyz"));
    }

    #[test]
    fn should_flag_8_char_password_like() {
        // Exactly 8 chars with 3+ char classes.
        assert!(looks_like_password("Ab1!xyzw"));
    }

    #[test]
    fn should_flag_64_char_password_like() {
        // Exactly 64 chars.
        let s = "Aa1!".repeat(16);
        assert_eq!(s.len(), 64);
        assert!(looks_like_password(&s));
    }

    #[test]
    fn should_not_flag_65_char_password_like() {
        let s = format!("{}x", "Aa1!".repeat(16));
        assert_eq!(s.len(), 65);
        assert!(!looks_like_password(&s));
    }

    #[test]
    fn should_not_flag_only_two_char_classes() {
        // Upper + lower only — 2 classes, needs 3.
        assert!(!looks_like_password("AbCdEfGhIj"));
    }

    // ── is_file_path ────────────────────────────────────────────

    #[test]
    fn should_recognize_unix_paths() {
        assert!(is_file_path("/usr/local/bin"));
        assert!(is_file_path("~/Documents/file.txt"));
    }

    #[test]
    fn should_recognize_windows_paths() {
        assert!(is_file_path("C:\\Users\\john"));
        assert!(is_file_path("D:/Projects/file.rs"));
    }

    #[test]
    fn should_not_flag_non_paths() {
        assert!(!is_file_path("hello world"));
        assert!(!is_file_path("sk-abc123"));
    }

    // ── is_url ──────────────────────────────────────────────────

    #[test]
    fn should_recognize_urls() {
        assert!(is_url("https://github.com"));
        assert!(is_url("http://localhost:3000"));
        assert!(is_url("file:///home/user/doc.html"));
    }

    #[test]
    fn should_not_flag_non_urls() {
        assert!(!is_url("not a url"));
        assert!(!is_url("ftp.example.com")); // no scheme
    }
}
