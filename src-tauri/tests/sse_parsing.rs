use flint_lib::providers::copilot::{
    extract_sse_tokens, parse_sse_events, SseEvent, ToolCallAccumulator,
};

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

// ---------------------------------------------------------------------------
// Tool call SSE parsing
// ---------------------------------------------------------------------------

#[test]
fn should_parse_tool_call_delta() {
    let buffer = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"name":"calculate","arguments":""}}]}}]}
"#;
    let (events, _) = parse_sse_events(buffer);
    assert!(events.contains(&SseEvent::ToolCallDelta {
        index: 0,
        id: Some("call_abc".to_string()),
        name: Some("calculate".to_string()),
        arguments: Some(String::new()),
    }));
}

#[test]
fn should_parse_incremental_tool_call_arguments() {
    let buffer = concat!(
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"calculate","arguments":""}}]}}]}"#,
        "\n",
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"expr"}}]}}]}"#,
        "\n",
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ession\":\"2+3\"}"}}]}}]}"#,
        "\n",
    );
    let (events, _) = parse_sse_events(buffer);

    let mut acc = ToolCallAccumulator::new();
    for event in events {
        if let SseEvent::ToolCallDelta { index, id, name, arguments } = event {
            acc.push(index, id, name, arguments);
        }
    }

    let calls = acc.take();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].id, "call_1");
    assert_eq!(calls[0].function.name, "calculate");
    assert_eq!(calls[0].function.arguments, r#"{"expression":"2+3"}"#);
}

#[test]
fn should_parse_multiple_concurrent_tool_calls() {
    let buffer = concat!(
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"calculate","arguments":"{\"expression\":\"1+1\"}"}}]}}]}"#,
        "\n",
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"calculate","arguments":"{\"expression\":\"2+2\"}"}}]}}]}"#,
        "\n",
    );
    let (events, _) = parse_sse_events(buffer);

    let mut acc = ToolCallAccumulator::new();
    for event in events {
        if let SseEvent::ToolCallDelta { index, id, name, arguments } = event {
            acc.push(index, id, name, arguments);
        }
    }

    let calls = acc.take();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].function.name, "calculate");
    assert_eq!(calls[1].function.name, "calculate");
}

#[test]
fn should_parse_finish_reason_tool_calls() {
    let buffer = r#"data: {"choices":[{"finish_reason":"tool_calls","delta":{}}]}
"#;
    let (events, _) = parse_sse_events(buffer);
    assert!(events.contains(&SseEvent::Finished("tool_calls".to_string())));
}

#[test]
fn should_parse_mixed_content_and_tool_calls() {
    let buffer = concat!(
        r#"data: {"choices":[{"delta":{"content":"Let me "}}]}"#,
        "\n",
        r#"data: {"choices":[{"delta":{"content":"calculate that."}}]}"#,
        "\n",
    );
    let (events, _) = parse_sse_events(buffer);

    let content_events: Vec<_> =
        events.iter().filter(|e| matches!(e, SseEvent::ContentDelta(_))).collect();
    assert_eq!(content_events.len(), 2);
}

#[test]
fn should_parse_done_as_sse_event() {
    let buffer = "data: [DONE]\n";
    let (events, _) = parse_sse_events(buffer);
    assert!(events.contains(&SseEvent::Done));
}
