import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../stores/chatStore";

export function useChat(): void {
  const appendToken = useChatStore((s) => s.appendToken);
  const finishResponse = useChatStore((s) => s.finishResponse);
  const setError = useChatStore((s) => s.setError);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen<string>("chat:token", (event) => {
          appendToken(event.payload);
        }),
      );
      unlisteners.push(
        await listen("chat:done", () => {
          finishResponse();
        }),
      );
      unlisteners.push(
        await listen<string>("chat:error", (event) => {
          setError(event.payload);
        }),
      );
    };

    void setup();
    return () => {
      unlisteners.forEach((fn) => {
        fn();
      });
    };
  }, [appendToken, finishResponse, setError]);
}
