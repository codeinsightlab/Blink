import assert from "node:assert/strict";
import { previewCommandOrder, startCommandDrag } from "../runtime/src/commandDrag.ts";

const original = ["a", "b", "c"];
assert.deepEqual(previewCommandOrder(original, "a", 2), ["b", "c", "a"]);
assert.deepEqual(previewCommandOrder(original, "c", 0), ["c", "a", "b"]);
assert.deepEqual(original, ["a", "b", "c"]);

// Minimal DOM geometry harness: verify the real pointer lifecycle without an IPC/backend.
class Element extends EventTarget {
  dataset: Record<string, string>;
  style = {
    transform: "",
    removeProperty: (_: string) => {
      this.style.transform = "";
    },
  };
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach((n) => this.classes.add(n)),
    remove: (...names: string[]) => names.forEach((n) => this.classes.delete(n)),
  };
  inert = false;
  captured = false;
  removed = false;
  index: number;
  constructor(index = 0) {
    super();
    this.index = index;
    this.dataset = { rowId: original[index] };
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: this.index * 72,
      right: 500,
      bottom: (this.index + 1) * 72,
      width: 500,
      height: 72,
    };
  }
  querySelectorAll() {
    return [];
  }
  cloneNode() {
    return new Element(this.index);
  }
  setAttribute() {}
  removeAttribute() {}
  setPointerCapture() {
    this.captured = true;
  }
  hasPointerCapture() {
    return this.captured;
  }
  releasePointerCapture() {
    this.captured = false;
    this.dispatchEvent(new Event("lostpointercapture"));
  }
  remove() {
    this.removed = true;
  }
}
function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    body: {
      append: (element: Element) => {
        overlay = element;
      },
    },
  });
  let overlay: Element;
  const rows = original.map((_, index) => new Element(index));
  const scroll = {
    scrollTop: 0,
    querySelectorAll: () => rows,
    getBoundingClientRect: () => ({ left: 0, right: 500, top: 0, bottom: 216 }),
  };
  const handle = Object.assign(new Element(), {
    closest: (selector: string) => (selector === ".grid-scroll" ? scroll : rows[0]),
  });
  Object.assign(globalThis, {
    window: win,
    document: doc,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  });
  const commits: string[][] = [];
  const start = { clientX: 20, clientY: 36, pointerId: 1 } as PointerEvent;
  const cancel = startCommandDrag(start, handle as unknown as HTMLElement, (order) =>
    commits.push(order),
  );
  const pointer = (type: string, y: number, pointerId = 1, x = 20) =>
    win.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerId }));
  return { win, doc, handle, rows, commits, cancel, pointer, overlay: () => overlay! };
}
{
  const h = setup();
  assert.equal(h.overlay().removed, false, "overlay appears on press, without delay");
  h.pointer("pointermove", 180);
  assert.deepEqual(h.commits, [], "moving never commits");
  assert.equal(h.rows[0].style.transform, "translateY(144px)");
  assert.equal(h.rows[1].style.transform, "translateY(-72px)");
  assert.equal(h.overlay().style.transform, "translate3d(0px, 144px, 0)");
  h.pointer("pointerup", 180);
  assert.deepEqual(h.commits, [["b", "c", "a"]]);
  assert.equal(h.overlay().removed, true);
  assert.ok(h.rows.every((row) => row.style.transform === "" && row.classes.size === 0));
  h.pointer("pointerup", 180);
  assert.equal(h.commits.length, 1);
}
for (const reason of [
  "pointercancel",
  "escape",
  "blur",
  "resize",
  "hidden",
  "rerender",
  "lostcapture",
]) {
  const h = setup();
  h.pointer("pointermove", 180);
  if (reason === "pointercancel") h.pointer(reason, 180);
  else if (reason === "escape")
    h.win.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  else if (reason === "hidden") {
    h.doc.hidden = true;
    h.doc.dispatchEvent(new Event("visibilitychange"));
  } else if (reason === "rerender") h.cancel();
  else if (reason === "lostcapture") h.handle.dispatchEvent(new Event("lostpointercapture"));
  else h.win.dispatchEvent(new Event(reason));
  h.pointer("pointerup", 180);
  assert.deepEqual(h.commits, [], reason);
  assert.equal(h.overlay().removed, true);
  assert.ok(h.rows.every((row) => row.style.transform === ""));
}
{
  const h = setup();
  h.pointer("pointermove", 180, 2);
  assert.equal(h.rows[0].style.transform, "");
  h.pointer("pointermove", 180);
  h.pointer("pointermove", 36);
  h.pointer("pointerup", 36);
  assert.deepEqual(h.commits, [], "returning to original order does not save");
}
{
  const h = setup();
  h.pointer("pointermove", 180);
  h.pointer("pointerup", 180, 1, 600);
  assert.deepEqual(h.commits, [], "release outside list cancels");
}
console.log("Live drag preview, overlay, commit-only-on-release and cancellation tests passed");
