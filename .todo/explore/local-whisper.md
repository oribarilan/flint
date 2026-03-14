# Local Whisper Model Integration

## Summary

Explore integrating a local Whisper speech-to-text model into Flint, enabling voice input for search queries and chat messages without sending audio to external services.

## Context

Flint is an AI-native launcher with search and chat modes. All text input currently requires typing. Adding voice input via a local Whisper model would allow hands-free interaction — particularly useful for chat mode where queries tend to be longer.

Running inference locally keeps audio data private and avoids network latency. The challenge is model size vs. accuracy, startup latency, and cross-platform audio capture.

### Current stack involved

- **`src-tauri/src/lib.rs`** — app setup, plugin registration, global shortcuts
- **`src-tauri/src/commands.rs`** — IPC command layer (would need new voice commands)
- **`src/components/SearchBar.tsx`** — input field where transcribed text would land
- **`src/stores/searchStore.ts`** — query state management
- **`src-tauri/src/kits/mod.rs`** — kit system (voice could be a kit or core feature)

## Questions to Explore

1. **Rust inference crate**: Evaluate `whisper-rs` (bindings to `whisper.cpp`) vs. `candle` (Hugging Face's pure-Rust ML framework). Key factors: binary size, cold-start latency, cross-platform support.
2. **Model selection**: Which Whisper model tier fits a launcher? `tiny` (~39 MB) is fast but less accurate; `base` (~74 MB) is a sweet spot; `small` (~244 MB) may be too heavy. Benchmark transcription quality for short queries (2–10 words).
3. **Audio capture**: Cross-platform microphone access — Tauri's `tauri-plugin-mic` or `cpal` crate. Permissions handling on macOS (microphone consent), Windows, and Linux.
4. **Activation UX**: How does the user start/stop recording? Options:
   - Hold-to-talk global hotkey (could be a command hotkey via the new per-command shortcuts system)
   - Push-to-talk button in the search bar
   - Voice activity detection (VAD) — more complex, potential false triggers
5. **Streaming vs. batch**: Transcribe after recording ends (simpler) or stream partial transcriptions while speaking (better UX, harder)?
6. **Model distribution**: Bundle the model file with the app (increases installer size) vs. download on first use (better install size, requires network once)?
7. **Resource usage**: Memory footprint and CPU/GPU usage during inference. Should inference run on a background thread? Can we use Metal/CUDA acceleration via `whisper.cpp`?

## Potential Architecture

```
Global hotkey (hold) → start recording (cpal)
                     → release → stop recording
                     → whisper.cpp inference (background thread)
                     → transcribed text → searchStore.setQuery() or chat input
```

Could be implemented as a kit (`VoiceKit`) with an `Execute`-mode command for push-to-talk, or as a core feature wired directly into the search bar.

## References

- [whisper-rs](https://github.com/tazz4843/whisper-rs) — Rust bindings for whisper.cpp
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — C/C++ port of OpenAI Whisper
- [candle](https://github.com/huggingface/candle) — Pure Rust ML framework with Whisper support
- [cpal](https://github.com/RustAudio/cpal) — Cross-platform audio I/O in Rust
