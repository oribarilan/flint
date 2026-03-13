use flint_lib::providers::copilot::extract_sse_tokens;

#[test]
fn should_extract_tokens_from_valid_sse() {
    let buffer = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n";
    let (tokens, remaining) = extract_sse_tokens(buffer);
    assert_eq!(tokens, vec!["Hello", " world"]);
    assert!(remaining.trim().is_empty());
}

#[test]
fn should_handle_crlf_line_endings() {
    let buffer = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\r\n\r\ndata: {\"choices\":[{\"delta\":{\"content\":\" there\"}}]}\r\n\r\n";
    let (tokens, _) = extract_sse_tokens(buffer);
    assert_eq!(tokens, vec!["Hi", " there"]);
}

#[test]
fn should_handle_done_marker() {
    let buffer = "data: {\"choices\":[{\"delta\":{\"content\":\"done\"}}]}\n\ndata: [DONE]\n\n";
    let (tokens, _) = extract_sse_tokens(buffer);
    assert_eq!(tokens, vec!["done"]);
}

#[test]
fn should_skip_non_data_lines() {
    let buffer =
        ": comment\nevent: ping\ndata: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n";
    let (tokens, _) = extract_sse_tokens(buffer);
    assert_eq!(tokens, vec!["ok"]);
}

#[test]
fn should_preserve_incomplete_line_in_remaining() {
    let buffer =
        "data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\ndata: {\"choices\":[{\"del";
    let (tokens, remaining) = extract_sse_tokens(buffer);
    assert_eq!(tokens, vec!["first"]);
    assert!(remaining.contains("del"));
}

#[test]
fn should_not_duplicate_tokens_from_single_choice() {
    let buffer = "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"}}]}\n\n";
    let (tokens, _) = extract_sse_tokens(buffer);
    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0], "Hello");
}

#[test]
fn should_handle_empty_content_delta() {
    let buffer = "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n";
    let (tokens, _) = extract_sse_tokens(buffer);
    assert!(tokens.is_empty());
}

#[test]
fn should_handle_empty_buffer() {
    let (tokens, remaining) = extract_sse_tokens("");
    assert!(tokens.is_empty());
    assert!(remaining.is_empty());
}

#[test]
fn should_handle_multiple_choices() {
    let buffer = "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"A\"}},{\"index\":1,\"delta\":{\"content\":\"B\"}}]}\n\n";
    let (tokens, _) = extract_sse_tokens(buffer);
    assert_eq!(tokens, vec!["A", "B"]);
}
