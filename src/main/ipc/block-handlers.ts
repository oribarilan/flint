import { ipcMain } from "electron";
import { IPC_CHANNELS } from "./channels";
import { BlocksActionSchema } from "../lib/blocks";
import type { Meeting } from "../types";
import { openExternalUrl } from "../lib/url";

export interface BlockHandlerDeps {
  findMeetingById: (id: string) => Meeting | undefined;
}

export function registerBlockHandlers(deps: BlockHandlerDeps): void {
  ipcMain.on(IPC_CHANNELS.BLOCKS_ACTION, (_event, raw: unknown) => {
    const result = BlocksActionSchema.safeParse(raw);
    if (!result.success) {
      console.warn("[ipc] blocks:action rejected: invalid payload", {
        issues: result.error.issues,
      });
      return;
    }

    const { type, payload } = result.data;

    switch (type) {
      case "join": {
        const meetingId = payload.meetingId;
        if (!meetingId) {
          console.warn("[ipc] blocks:action join: missing meetingId");
          return;
        }
        const meeting = deps.findMeetingById(meetingId);
        if (!meeting?.joinUrl) {
          console.warn("[ipc] blocks:action join: meeting not found or no joinUrl", { meetingId });
          return;
        }
        openExternalUrl(meeting.joinUrl);
        break;
      }
      case "dismiss":
        break;
      case "open": {
        const url = payload.url;
        if (url) {
          openExternalUrl(url);
        }
        break;
      }
    }
  });
}
