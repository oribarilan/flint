//! Tests for conversion helpers: core search results → unified [`KitSearchResult`].

use crate::kits::registry::conversion::is_text_file;
use crate::kits::{KitAction, KitSearchResult};

#[test]
fn from_core_search_converts_results() {
    let core = vec![crate::search::SearchResult {
        id: "/tmp/foo.txt".to_string(),
        name: "foo.txt".to_string(),
        path: "/tmp/foo.txt".to_string(),
        kind: crate::indexer::EntryKind::File,
    }];
    let converted = KitSearchResult::from_core_search(core);
    assert_eq!(converted.len(), 1);
    assert_eq!(converted[0].kit_id, "core");
    assert_eq!(converted[0].title, "foo.txt");
    assert!(matches!(converted[0].kind, crate::kits::ResultKind::File));
}

#[test]
fn from_core_search_encodes_kind_correctly() {
    let core = vec![crate::search::SearchResult {
        id: "/app/Slack".to_string(),
        name: "Slack".to_string(),
        path: "/app/Slack".to_string(),
        kind: crate::indexer::EntryKind::Application,
    }];
    let converted = KitSearchResult::from_core_search(core);
    assert!(matches!(converted[0].kind, crate::kits::ResultKind::Application));
}

#[test]
fn text_file_result_has_six_actions_including_open_in_editor() {
    let core = vec![crate::search::SearchResult {
        id: "/tmp/hello.rs".to_string(),
        name: "hello.rs".to_string(),
        path: "/tmp/hello.rs".to_string(),
        kind: crate::indexer::EntryKind::File,
    }];
    let converted = KitSearchResult::from_core_search(core);
    let actions = &converted[0].actions;
    assert_eq!(actions.len(), 6, "text file should have 6 actions");
    assert!(matches!(&actions[0], KitAction::Open { .. }));
    assert!(matches!(&actions[1], KitAction::OpenInEditor { .. }));
    assert!(matches!(&actions[2], KitAction::RevealInFileManager { .. }));
    assert!(matches!(&actions[3], KitAction::CopyPath { .. }));
    assert!(matches!(&actions[4], KitAction::CopyName { .. }));
    assert!(matches!(&actions[5], KitAction::Delete { .. }));
}

#[test]
fn binary_file_result_has_five_actions_without_open_in_editor() {
    let core = vec![crate::search::SearchResult {
        id: "/tmp/photo.png".to_string(),
        name: "photo.png".to_string(),
        path: "/tmp/photo.png".to_string(),
        kind: crate::indexer::EntryKind::File,
    }];
    let converted = KitSearchResult::from_core_search(core);
    let actions = &converted[0].actions;
    assert_eq!(actions.len(), 5, "binary file should have 5 actions (no Open in Editor)");
    assert!(matches!(&actions[0], KitAction::Open { .. }));
    assert!(matches!(&actions[1], KitAction::RevealInFileManager { .. }));
}

#[test]
fn directory_result_has_four_actions() {
    let core = vec![crate::search::SearchResult {
        id: "/tmp/mydir".to_string(),
        name: "mydir".to_string(),
        path: "/tmp/mydir".to_string(),
        kind: crate::indexer::EntryKind::Directory,
    }];
    let converted = KitSearchResult::from_core_search(core);
    let actions = &converted[0].actions;
    assert_eq!(actions.len(), 4, "directory should have 4 actions");
    assert!(matches!(&actions[0], KitAction::Open { .. }));
    assert!(matches!(&actions[1], KitAction::CopyPath { .. }));
    assert!(matches!(&actions[2], KitAction::CopyName { .. }));
    assert!(matches!(&actions[3], KitAction::Delete { .. }));
}

#[test]
fn application_result_has_two_actions() {
    let core = vec![crate::search::SearchResult {
        id: "/Applications/Safari.app".to_string(),
        name: "Safari".to_string(),
        path: "/Applications/Safari.app".to_string(),
        kind: crate::indexer::EntryKind::Application,
    }];
    let converted = KitSearchResult::from_core_search(core);
    let actions = &converted[0].actions;
    assert_eq!(actions.len(), 2, "application should have 2 actions");
    assert!(matches!(&actions[0], KitAction::Open { .. }));
    assert!(matches!(&actions[1], KitAction::RevealInFileManager { .. }));
}

#[test]
fn is_text_file_detects_common_extensions() {
    assert!(is_text_file("main.rs"));
    assert!(is_text_file("index.tsx"));
    assert!(is_text_file("README.md"));
    assert!(is_text_file("config.toml"));
    assert!(is_text_file("styles.css"));
    assert!(is_text_file("Makefile.cmake"));
}

#[test]
fn is_text_file_rejects_binary_extensions() {
    assert!(!is_text_file("photo.png"));
    assert!(!is_text_file("video.mp4"));
    assert!(!is_text_file("archive.zip"));
    assert!(!is_text_file("binary.exe"));
    assert!(!is_text_file("no_extension"));
}

#[test]
fn is_text_file_is_case_insensitive() {
    assert!(is_text_file("FILE.RS"));
    assert!(is_text_file("README.MD"));
    assert!(is_text_file("config.JSON"));
}

#[test]
fn copy_name_action_contains_filename_not_path() {
    let core = vec![crate::search::SearchResult {
        id: "/deep/nested/path/file.ts".to_string(),
        name: "file.ts".to_string(),
        path: "/deep/nested/path/file.ts".to_string(),
        kind: crate::indexer::EntryKind::File,
    }];
    let converted = KitSearchResult::from_core_search(core);
    let copy_name = converted[0].actions.iter().find(|a| matches!(a, KitAction::CopyName { .. }));
    assert!(copy_name.is_some());
    if let KitAction::CopyName { name } = copy_name.unwrap() {
        assert_eq!(name, "file.ts");
    }
}
