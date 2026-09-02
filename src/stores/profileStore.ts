import { create } from "zustand";
import type { AuthoringAction, ProfileDraft, WebAuthoringState } from "../models/authoring";
import { webAuthoringStateSchema } from "../models/authoring";
import { readStorage, STORAGE_KEYS, writeStorage } from "../services/storageService";

const newLocalId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function loadAuthoringState(): WebAuthoringState {
  const parsed = webAuthoringStateSchema.safeParse(readStorage(STORAGE_KEYS.drafts));
  return parsed.success ? parsed.data : { drafts: [] };
}

type ProfileState = WebAuthoringState & {
  createDraft: () => string;
  deleteDraft: (localId: string) => void;
  updateDraftDetails: (localId: string, name: string, description: string) => void;
  addActions: (localId: string, actions: AuthoringAction[]) => void;
  replaceAction: (localId: string, actionIndex: number, action: AuthoringAction) => void;
  removeAction: (localId: string, actionIndex: number) => void;
  moveAction: (localId: string, actionIndex: number, direction: -1 | 1) => void;
};

const persist = (drafts: ProfileDraft[]) => {
  const state = webAuthoringStateSchema.parse({ drafts });
  writeStorage(STORAGE_KEYS.drafts, state);
  return state.drafts;
};

export const useProfileStore = create<ProfileState>((set) => ({
  ...loadAuthoringState(),
  createDraft: () => {
    const localId = newLocalId();
    set((state) => ({
      drafts: persist([
        ...state.drafts,
        { localId, name: `能力 ${state.drafts.length + 1}`, actions: [] },
      ]),
    }));
    return localId;
  },
  deleteDraft: (localId) =>
    set((state) => ({
      drafts: persist(state.drafts.filter((draft) => draft.localId !== localId)),
    })),
  updateDraftDetails: (localId, name, description) =>
    set((state) => ({
      drafts: persist(
        state.drafts.map((draft) =>
          draft.localId === localId
            ? {
                ...draft,
                name,
                ...(description ? { description } : { description: undefined }),
              }
            : draft,
        ),
      ),
    })),
  addActions: (localId, actions) =>
    set((state) => ({
      drafts: persist(
        state.drafts.map((draft) =>
          draft.localId === localId ? { ...draft, actions: [...draft.actions, ...actions] } : draft,
        ),
      ),
    })),
  replaceAction: (localId, actionIndex, action) =>
    set((state) => ({
      drafts: persist(
        state.drafts.map((draft) =>
          draft.localId === localId
            ? {
                ...draft,
                actions: draft.actions.map((item, index) =>
                  index === actionIndex ? action : item,
                ),
              }
            : draft,
        ),
      ),
    })),
  removeAction: (localId, actionIndex) =>
    set((state) => ({
      drafts: persist(
        state.drafts.map((draft) =>
          draft.localId === localId
            ? { ...draft, actions: draft.actions.filter((_, index) => index !== actionIndex) }
            : draft,
        ),
      ),
    })),
  moveAction: (localId, actionIndex, direction) =>
    set((state) => ({
      drafts: persist(
        state.drafts.map((draft) => {
          if (draft.localId !== localId) return draft;
          const target = actionIndex + direction;
          if (target < 0 || target >= draft.actions.length) return draft;
          const actions = [...draft.actions];
          [actions[actionIndex], actions[target]] = [actions[target]!, actions[actionIndex]!];
          return { ...draft, actions };
        }),
      ),
    })),
}));
