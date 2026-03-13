# Auto-Select First Search Result

## Summary

When search results appear, the first result should be automatically selected/highlighted. Currently the user must press the down arrow to start navigating from the search input row, which is an unnecessary extra step.

## Requirements

- When results are populated (or updated), the first result should be selected by default
- Pressing Enter immediately after typing should open/activate the first result
- Arrow-down from the search input should move to the second result (since first is already selected)
- If results change (e.g., user continues typing), selection should reset to the first result
- If there are no results, no selection state

## Technical Notes

- This likely involves setting the selected index to `0` instead of `-1` (or equivalent) when results are non-empty
- Check the search store / results list component for the selection state logic
- Ensure keyboard navigation still works correctly with this change
