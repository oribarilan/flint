# Clear Chat Input on Send

## Summary

In chat mode, pressing Enter to send a message should also clear the input field. Currently the input retains the text after sending.

## Requirements

- After a message is sent (Enter pressed with non-empty input), the input field should be cleared
- The input should remain focused and ready for the next message
- Shift+Enter (newline) should not trigger a clear

## Technical Notes

- Find the chat input's submit/send handler and add input clearing logic after the send call
- This is likely a one-line fix in the chat component or its event handler
