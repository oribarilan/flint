# Bug: Action Panel Last Item Clipped When Header Present

## Problem

When ANY content is added before the action items inside the Action Panel's scrollable container, the last action item is partially or fully hidden behind the HintBar footer. Without the extra content, all items display correctly.

The normal ResultsList (same CSS, same parent layout) works fine with equivalent content volumes.

## Environment

- Tauri window height: 500px (`tauri.conf.json`)
- `.launcher` max-height: 65vh = 325px
- Available for content: ~237px (325 - 56px SearchBar - 32px HintBar)
- Action items total: ~225px (5 items + divider + Delete)
- With header: ~273px (225 + 48px header) → overflows, should scroll

## Root Cause (suspected)

The Tauri WebView's `overflow-y: auto` does not correctly detect that content exceeds the container height in this specific layout. The scrollbar sometimes appears but the scrollable area visually extends behind the HintBar rather than being constrained to the space between SearchBar and HintBar.

Forcing `overflow-y: scroll` (always show scrollbar) works when there's no header, but fails when the header adds height. This suggests the WebView is miscalculating the container's available height in the flex layout.

## What Was Tried

### 1. Wrapper container div (flex column with overflow: hidden)
Header + actionList inside a container div with `flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column`.
**Result:** Content collapsed to a single line. `overflow: hidden` + nested flex caused layout collapse.

### 2. flex-shrink: 0 on SearchBar
Added `flex-shrink: 0` to SearchBar wrapper to prevent flex shrinking.
**Result:** No change — the issue is not SearchBar shrinking.

### 3. Sticky header inside scroll area
Header with `position: sticky; top: 0` as first child of the scrollable `.actionList`.
**Result:** Still clipped. Sticky positioning didn't help.

### 4. Header as sibling (React fragment)
ActionPanel returns a fragment: header + actionList as two direct children of `.launcher`.
**Result:** Still clipped. Extra `flex-shrink: 0` child doesn't distribute space correctly.

### 5. Header as separate component in App.tsx
`<ActionPanelHeader />` rendered as its own sibling between SearchBar and ActionPanel in App.tsx.
**Result:** Still clipped. Same problem as #4.

### 6. Using ResultsList's exact CSS class
Applied `ResultsList.module.css`'s `.container` class to the ActionPanel div.
**Result:** Still clipped when header present. Works without header. Proves it's not a CSS difference.

### 7. overflow-y: scroll (force scrollbar)
Used `overflow-y: scroll` instead of `auto`.
**Result:** Works WITHOUT header. Fails WITH header. Scrollbar appears but content extends behind HintBar.

### 8. Minimal header (tiny single div)
Replaced full header with `<div style={{padding: "8px 20px", fontSize: 11}}>filename</div>` (~28px).
**Result:** Partially clipped. Less clipping than full header, but still not fully visible. Confirms it's a height issue, not a CSS property issue.

### 9. 48px spacer div (no content, just height)
Plain `<div style={{height: 48}} />` instead of header.
**Result:** Still clipped. Even empty height causes the issue.

## What Works

- Action items without any header/spacer → all items visible
- `overflow-y: scroll` without header → scrollbar works correctly
- Normal ResultsList with same number of items → works fine

## Current State

Header removed. Action Panel shows actions directly without a header. The result name is visible in the Actions chip in the SearchBar.

## Possible Next Steps

1. **Investigate Tauri WebView flex/overflow behavior** — This may be a WebKit-specific bug with `overflow-y: auto` in flex children with `max-height` on ancestor. Test in a plain HTML file loaded in the Tauri WebView to isolate.

2. **Use JavaScript to set explicit height** — After mount, measure available space with `getBoundingClientRect()` and set the `.actionList` height explicitly in pixels, bypassing CSS flex.

3. **Increase window height** — If the window were 600px instead of 500px, the content would fit without scrolling. But this changes the overall design.

4. **Restructure `.launcher` to use CSS Grid** — Grid with explicit row definitions might handle the height distribution more reliably than flexbox in this WebView.

5. **Move header info into SearchBar** — The Actions chip already shows "Actions". Could extend it to show the filename too, eliminating the need for a separate header element.
