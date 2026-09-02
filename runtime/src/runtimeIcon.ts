import {
  AppWindow, ClipboardPaste, Command, Copy, Ellipsis, FileInput, FolderOpen, Image, Info,
  LayoutGrid, Link, PanelsTopLeft, Pencil, Redo2, Save, Scan, Scissors, Search, Settings,
  Trash2, Undo2, Unplug, createElement, type IconNode,
} from "lucide";

export type RuntimeIconName =
  | "brand" | "deck" | "settings" | "folder" | "import" | "more" | "copy" | "paste"
  | "cut" | "undo" | "redo" | "select-all" | "save" | "find" | "app" | "command"
  | "unbind" | "image" | "rename" | "delete" | "info" | "external";

const ICONS: Record<RuntimeIconName, IconNode> = {
  brand: PanelsTopLeft, deck: LayoutGrid, settings: Settings, folder: FolderOpen, import: FileInput,
  more: Ellipsis, copy: Copy, paste: ClipboardPaste, cut: Scissors, undo: Undo2, redo: Redo2,
  "select-all": Scan, save: Save, find: Search, app: AppWindow, command: Command,
  unbind: Unplug, image: Image, rename: Pencil, delete: Trash2, info: Info, external: Link,
};

export function RuntimeIcon(name: RuntimeIconName, className = "") {
  const svg = createElement(ICONS[name]);
  svg.setAttribute("class", `runtime-icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  return svg.outerHTML;
}
