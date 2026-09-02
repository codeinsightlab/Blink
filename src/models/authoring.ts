import { z } from "zod";

export type AuthoringAction =
  { type: "OPEN_APP"; appId: string } | { type: "COMMAND"; commandId: string };

export interface ProfileDraft {
  localId: string;
  name: string;
  description?: string;
  actions: AuthoringAction[];
}

export interface WebAuthoringState {
  drafts: ProfileDraft[];
}

const authoringActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("OPEN_APP"), appId: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal("COMMAND"), commandId: z.string().trim().min(1) }).strict(),
]);

export const profileDraftSchema = z
  .object({
    localId: z.string().trim().min(1),
    name: z.string(),
    description: z.string().optional(),
    actions: z.array(authoringActionSchema),
  })
  .strict();

export const webAuthoringStateSchema = z.object({ drafts: z.array(profileDraftSchema) }).strict();
