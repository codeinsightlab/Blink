import {
  Activity,
  ChevronDown,
  CircleHelp,
  FileText,
  Keyboard,
  LogOut,
  Mail,
  AppWindow,
  ClipboardPaste,
  Command,
  Copy,
  Ellipsis,
  FileInput,
  FolderOpen,
  GripVertical,
  Image,
  Info,
  LayoutGrid,
  Link,
  Pencil,
  Plus,
  Redo2,
  Save,
  Scan,
  Scissors,
  Search,
  Settings,
  Trash2,
  Undo2,
  Unplug,
  createElement,
  type IconNode,
} from "lucide";
import brandIcon from "../src-tauri/icons/icon.svg";

export type RuntimeIconName =
  | "activity"
  | "chevron-down"
  | "help"
  | "result"
  | "keyboard"
  | "quit"
  | "mail"
  | "plus"
  | "brand"
  | "deck"
  | "settings"
  | "folder"
  | "import"
  | "more"
  | "copy"
  | "paste"
  | "cut"
  | "undo"
  | "redo"
  | "select-all"
  | "save"
  | "find"
  | "app"
  | "command"
  | "unbind"
  | "image"
  | "rename"
  | "delete"
  | "info"
  | "external"
  | "drag";

const ICONS: Record<Exclude<RuntimeIconName, "brand">, IconNode> = {
  activity: Activity,
  "chevron-down": ChevronDown,
  help: CircleHelp,
  result: FileText,
  keyboard: Keyboard,
  quit: LogOut,
  mail: Mail,
  plus: Plus,
  deck: LayoutGrid,
  settings: Settings,
  folder: FolderOpen,
  import: FileInput,
  more: Ellipsis,
  copy: Copy,
  paste: ClipboardPaste,
  cut: Scissors,
  undo: Undo2,
  redo: Redo2,
  "select-all": Scan,
  save: Save,
  find: Search,
  app: AppWindow,
  command: Command,
  unbind: Unplug,
  image: Image,
  rename: Pencil,
  delete: Trash2,
  info: Info,
  external: Link,
  drag: GripVertical,
};

export function RuntimeIcon(name: RuntimeIconName, className = "") {
  if (name === "brand")
    return `<img class="runtime-brand-icon" src="${brandIcon}" alt="Blink" draggable="false" />`;
  const svg = createElement(ICONS[name]);
  svg.setAttribute("class", `runtime-icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  return svg.outerHTML;
}
