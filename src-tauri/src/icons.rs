//! macOS application icon extraction.
//!
//! Reads an app bundle's `Info.plist` to locate its `.icns` file, then
//! extracts an embedded PNG from the `.icns` container. Returns the image
//! as a `data:image/png;base64,…` URI ready for the frontend.

use std::fs;
use std::path::Path;

use base64::prelude::*;

/// Preferred `.icns` type codes in order, each containing PNG data.
/// ic07 = 128×128, ic12 = 32×32@2x (64px), ic08 = 256×256, ic11 = 16×16@2x.
const PREFERRED_TYPES: &[[u8; 4]] = &[*b"ic07", *b"ic12", *b"ic08", *b"ic11", *b"ic09"];

/// PNG file magic bytes.
const PNG_MAGIC: &[u8] = &[0x89, 0x50, 0x4E, 0x47];

/// Extract an app icon as a base64 `data:image/png;base64,…` string.
///
/// Returns `None` if the icon cannot be extracted (missing plist, missing
/// icon file, no PNG entry in the `.icns`, etc.).
pub fn extract_app_icon(app_path: &str) -> Option<String> {
    let icns_path = resolve_icns_path(app_path)?;
    let data = fs::read(&icns_path).ok()?;
    let png_bytes = extract_png_from_icns(&data)?;

    let mut uri = String::from("data:image/png;base64,");
    uri.push_str(&BASE64_STANDARD.encode(png_bytes));
    Some(uri)
}

/// Read `Contents/Info.plist` and resolve the absolute `.icns` path.
fn resolve_icns_path(app_path: &str) -> Option<std::path::PathBuf> {
    let plist_path = Path::new(app_path).join("Contents/Info.plist");
    let val = plist::Value::from_file(&plist_path).ok()?;
    let dict = val.as_dictionary()?;

    let mut icon_file = dict.get("CFBundleIconFile")?.as_string()?.to_owned();

    // Apple allows omitting the .icns extension in the plist.
    if !std::path::Path::new(&icon_file)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("icns"))
    {
        icon_file.push_str(".icns");
    }

    let icns = Path::new(app_path).join("Contents/Resources").join(&icon_file);
    icns.exists().then_some(icns)
}

/// Parse an `.icns` file and extract PNG bytes for the best-matching type.
///
/// The `.icns` binary format:
///   - 4-byte magic `icns`
///   - 4-byte total size (big-endian)
///   - Repeating entries: 4-byte type, 4-byte size (incl. header), (size-8) data
///
/// Modern icon types (ic07, ic08, ic09, …) embed raw PNG data.
fn extract_png_from_icns(data: &[u8]) -> Option<&[u8]> {
    if data.len() < 8 || &data[0..4] != b"icns" {
        return None;
    }

    let entries = parse_icns_entries(data);

    // Try preferred types first.
    for pref in PREFERRED_TYPES {
        if let Some(payload) = entries.iter().find(|(t, _)| t == pref).map(|(_, d)| *d) {
            if payload.starts_with(PNG_MAGIC) {
                return Some(payload);
            }
        }
    }

    // Fallback: any entry containing PNG data.
    entries.iter().find(|(_, payload)| payload.starts_with(PNG_MAGIC)).map(|(_, d)| *d)
}

/// Parse all entries from an `.icns` file, returning (type, payload) pairs.
fn parse_icns_entries(data: &[u8]) -> Vec<([u8; 4], &[u8])> {
    let mut entries = Vec::new();
    let mut offset = 8; // skip file header

    while offset + 8 <= data.len() {
        let entry_type: [u8; 4] = data[offset..offset + 4].try_into().unwrap_or_default();
        let entry_size =
            u32::from_be_bytes(data[offset + 4..offset + 8].try_into().unwrap_or_default())
                as usize;

        if entry_size < 8 || offset + entry_size > data.len() {
            break;
        }

        let payload = &data[offset + 8..offset + entry_size];
        entries.push((entry_type, payload));

        offset += entry_size;
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_icns(entries: &[(&[u8; 4], &[u8])]) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(b"icns");
        let total_size_pos = data.len();
        data.extend_from_slice(&[0; 4]); // placeholder
        for (type_code, payload) in entries {
            data.extend_from_slice(*type_code);
            let entry_size = u32::try_from(payload.len() + 8).unwrap();
            data.extend_from_slice(&entry_size.to_be_bytes());
            data.extend_from_slice(payload);
        }
        let total = u32::try_from(data.len()).unwrap();
        data[total_size_pos..total_size_pos + 4].copy_from_slice(&total.to_be_bytes());
        data
    }

    fn png_bytes() -> Vec<u8> {
        let mut b = vec![0x89, 0x50, 0x4E, 0x47]; // PNG magic
        b.extend_from_slice(&[0; 20]); // dummy payload
        b
    }

    #[test]
    fn should_reject_empty_data() {
        assert!(extract_png_from_icns(&[]).is_none());
    }

    #[test]
    fn should_reject_invalid_magic() {
        let data = build_icns(&[]);
        let mut bad = data;
        bad[0..4].copy_from_slice(b"nope");
        assert!(extract_png_from_icns(&bad).is_none());
    }

    #[test]
    fn should_reject_too_short_data() {
        assert!(extract_png_from_icns(&[0x69, 0x63, 0x6E, 0x73, 0x00]).is_none());
    }

    #[test]
    fn should_parse_single_entry() {
        let payload = b"hello world";
        let data = build_icns(&[(b"ic07", payload.as_slice())]);
        let entries = parse_icns_entries(&data);
        assert_eq!(entries.len(), 1);
        assert_eq!(&entries[0].0, b"ic07");
        assert_eq!(entries[0].1, payload);
    }

    #[test]
    fn should_parse_multiple_entries() {
        let p1 = b"first";
        let p2 = b"second";
        let data = build_icns(&[(b"ic07", p1.as_slice()), (b"ic08", p2.as_slice())]);
        let entries = parse_icns_entries(&data);
        assert_eq!(entries.len(), 2);
        assert_eq!(&entries[0].0, b"ic07");
        assert_eq!(entries[0].1, p1.as_slice());
        assert_eq!(&entries[1].0, b"ic08");
        assert_eq!(entries[1].1, p2.as_slice());
    }

    #[test]
    fn should_extract_png_from_preferred_type() {
        let png = png_bytes();
        let data = build_icns(&[(b"ic07", &png)]);
        let result = extract_png_from_icns(&data);
        assert!(result.is_some());
        assert!(result.unwrap().starts_with(PNG_MAGIC));
    }

    #[test]
    fn should_fallback_to_any_png_entry() {
        let png = png_bytes();
        let data = build_icns(&[(b"icXX", &png)]);
        let result = extract_png_from_icns(&data);
        assert!(result.is_some());
        assert!(result.unwrap().starts_with(PNG_MAGIC));
    }

    #[test]
    fn should_skip_non_png_entries() {
        let non_png = vec![0x00, 0x00, 0x00, 0x00, 0x00];
        let data = build_icns(&[(b"ic07", &non_png)]);
        assert!(extract_png_from_icns(&data).is_none());
    }

    #[test]
    fn should_prefer_ic07_over_others() {
        let png07 = {
            let mut b = png_bytes();
            b.push(0x07); // tag to distinguish
            b
        };
        let png08 = {
            let mut b = png_bytes();
            b.push(0x08);
            b
        };
        // ic08 appears first in the file, but ic07 should be preferred
        let data = build_icns(&[(b"ic08", &png08), (b"ic07", &png07)]);
        let result = extract_png_from_icns(&data).unwrap();
        assert_eq!(*result.last().unwrap(), 0x07);
    }
}
