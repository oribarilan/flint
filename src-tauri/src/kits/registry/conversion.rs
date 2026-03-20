//! Conversion helpers: core search results → unified `KitSearchResult` type.

use crate::kits::{KitAction, KitIcon, KitSearchResult, ResultKind};

impl KitSearchResult {
    /// Convert core file search results into the unified result type.
    pub fn from_core_search(results: Vec<crate::search::SearchResult>) -> Vec<Self> {
        results.into_iter().map(|r| Self::from_core_result(r, 0)).collect()
    }

    /// Convert a single core file search result with its score.
    pub fn from_core_result(r: crate::search::SearchResult, score: u32) -> Self {
        let (kind, kind_str) = match r.kind {
            crate::indexer::EntryKind::File => (ResultKind::File, "file"),
            crate::indexer::EntryKind::Directory => (ResultKind::Directory, "directory"),
            crate::indexer::EntryKind::Application => (ResultKind::Application, "application"),
        };

        let actions = build_core_actions(&r.path, &r.name, r.kind);

        Self {
            kit_id: "core".to_string(),
            kit_name: None,
            id: r.id,
            title: r.name,
            subtitle: Some(r.path),
            icon: Some(KitIcon::Named(kind_str.to_string())),
            kind,
            accessories: Vec::new(),
            actions,
            preview: None,
            score: Some(score),
        }
    }
}

/// Build the ordered action list for a core search result based on its kind.
pub(super) fn build_core_actions(
    path: &str,
    name: &str,
    kind: crate::indexer::EntryKind,
) -> Vec<KitAction> {
    match kind {
        crate::indexer::EntryKind::File => {
            let mut actions = vec![KitAction::Open { target: path.to_owned() }];
            if is_text_file(name) {
                actions.push(KitAction::OpenInEditor { target: path.to_owned() });
            }
            actions.push(KitAction::RevealInFileManager { target: path.to_owned() });
            actions.push(KitAction::CopyPath { path: path.to_owned() });
            actions.push(KitAction::CopyName { name: name.to_owned() });
            actions.push(KitAction::Delete { target: path.to_owned() });
            actions
        }
        crate::indexer::EntryKind::Directory => {
            vec![
                KitAction::Open { target: path.to_owned() },
                KitAction::CopyPath { path: path.to_owned() },
                KitAction::CopyName { name: name.to_owned() },
                KitAction::Delete { target: path.to_owned() },
            ]
        }
        crate::indexer::EntryKind::Application => {
            vec![
                KitAction::Open { target: path.to_owned() },
                KitAction::RevealInFileManager { target: path.to_owned() },
            ]
        }
    }
}

/// Heuristic: consider a file "text/code" if its extension is in this set.
/// Binary/media files get fewer actions (no "Open in Editor").
#[allow(clippy::too_many_lines)]
pub(super) fn is_text_file(name: &str) -> bool {
    let ext = match name.rsplit('.').next() {
        Some(e) => e.to_ascii_lowercase(),
        None => return false,
    };
    matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "markdown"
            | "rs"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "json"
            | "toml"
            | "yaml"
            | "yml"
            | "xml"
            | "html"
            | "htm"
            | "css"
            | "scss"
            | "less"
            | "py"
            | "rb"
            | "go"
            | "java"
            | "kt"
            | "kts"
            | "c"
            | "h"
            | "cpp"
            | "hpp"
            | "cc"
            | "cs"
            | "swift"
            | "m"
            | "mm"
            | "sh"
            | "bash"
            | "zsh"
            | "fish"
            | "ps1"
            | "bat"
            | "cmd"
            | "lua"
            | "vim"
            | "el"
            | "clj"
            | "cljs"
            | "ex"
            | "exs"
            | "erl"
            | "hs"
            | "ml"
            | "mli"
            | "r"
            | "sql"
            | "graphql"
            | "gql"
            | "proto"
            | "tf"
            | "hcl"
            | "dockerfile"
            | "makefile"
            | "cmake"
            | "conf"
            | "ini"
            | "cfg"
            | "env"
            | "gitignore"
            | "gitattributes"
            | "editorconfig"
            | "lock"
            | "log"
            | "csv"
            | "tsv"
            | "svg"
            | "tex"
            | "bib"
            | "rst"
            | "adoc"
            | "org"
            | "vue"
            | "svelte"
            | "astro"
            | "php"
            | "pl"
            | "pm"
            | "scala"
            | "sbt"
            | "dart"
            | "zig"
            | "nim"
            | "v"
            | "d"
            | "f90"
            | "f95"
            | "jl"
    )
}
