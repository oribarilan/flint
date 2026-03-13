import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../stores/chatStore";

export function useChat(): void {
  const appendToken = useChatStore((s) => s.appendToken);
  const finishResponse = useChatStore((s) => s.finishResponse);
  const setError = useChatStore((s) => s.setError);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const tokenUn = await listen<string>("chat:token", (event) => {
        appendToken(event.payload);
      });
      const doneUn = await listen("chat:done", () => {
        finishResponse();
      });
      const errorUn = await listen<string>("chat:error", (event) => {
        setError(event.payload);
      });

      // If effect was cleaned up while awaiting, immediately unlisten.
      if (cancelledRef.current) {
        tokenUn();
        doneUn();
        errorUn();
      } else {
        unlisteners.push(tokenUn, doneUn, errorUn);
      }
    };

    void setup();
    return () => {
      cancelledRef.current = true;
      unlisteners.forEach((fn) => {
        fn();
      });
    };
  }, [appendToken, finishResponse, setError]);
}
