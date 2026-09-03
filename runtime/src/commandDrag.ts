/** UI-only preview: neither the source order nor persisted preferences are mutated. */
export function previewCommandOrder(order: string[], id: string, index: number): string[] {
  if (!order.includes(id)) return [...order];
  const next = order.filter((item) => item !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}

/** Floating clone + translated layout slots; storage is touched only by onCommit. */
export function startCommandDrag(
  event: PointerEvent,
  handle: HTMLElement,
  onCommit: (order: string[]) => void,
): () => void {
  const scroll = handle.closest<HTMLElement>(".grid-scroll")!;
  const rows = [...scroll.querySelectorAll<HTMLElement>("[data-row-id]")];
  const source = handle.closest<HTMLElement>("[data-row-id]")!;
  const initial = rows.map((row) => row.dataset.rowId!);
  const id = source.dataset.rowId!;
  const rects = rows.map((row) => row.getBoundingClientRect());
  const sourceRect = source.getBoundingClientRect();
  const initialScroll = scroll.scrollTop;
  let preview = [...initial];
  let x = event.clientX;
  let y = event.clientY;
  let active = true;
  let frame = 0;
  let lastTime = 0;
  const overlay = source.cloneNode(true) as HTMLElement;
  overlay.classList.add("command-drag-overlay");
  overlay.setAttribute("aria-hidden", "true");
  overlay.inert = true;
  for (const element of [overlay, ...overlay.querySelectorAll<HTMLElement>("*")]) {
    element.removeAttribute("id");
    element.removeAttribute("data-row-id");
    element.removeAttribute("data-drag-id");
  }
  Object.assign(overlay.style, {
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
  });
  document.body.append(overlay);
  source.classList.add("is-drag-source");
  rows.forEach((row) => row.classList.add("is-sorting"));
  handle.setPointerCapture(event.pointerId);

  const update = () => {
    overlay.style.transform = `translate3d(${x - event.clientX}px, ${y - event.clientY}px, 0)`;
    const center =
      sourceRect.top + sourceRect.height / 2 + y - event.clientY + scroll.scrollTop - initialScroll;
    // Stable, untransformed slot centers avoid collision oscillation during animation.
    const index = rects.reduce(
      (best, rect, candidate) =>
        Math.abs(center - rect.top - rect.height / 2) <
        Math.abs(center - rects[best].top - rects[best].height / 2)
          ? candidate
          : best,
      0,
    );
    const next = previewCommandOrder(initial, id, index);
    if (next.every((item, i) => item === preview[i])) return;
    preview = next;
    let top = rects[0].top;
    for (const item of preview) {
      const originalIndex = initial.indexOf(item);
      rows[originalIndex].style.transform = `translateY(${top - rects[originalIndex].top}px)`;
      top += rects[originalIndex].height;
    }
  };
  const tick = (time: number) => {
    if (!active) return;
    const elapsed = lastTime ? Math.min(time - lastTime, 32) : 0;
    lastTime = time;
    const bounds = scroll.getBoundingClientRect();
    const speed =
      x >= bounds.left && x <= bounds.right
        ? y < bounds.top + 36
          ? -Math.min(1, (bounds.top + 36 - y) / 36)
          : y > bounds.bottom - 36
            ? Math.min(1, (y - bounds.bottom + 36) / 36)
            : 0
        : 0;
    scroll.scrollTop += speed * elapsed * 0.6;
    update();
    frame = requestAnimationFrame(tick);
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancelPointer);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("resize", cancel);
    document.removeEventListener("visibilitychange", visibility);
    handle.removeEventListener("lostpointercapture", cancel);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    overlay.remove();
    rows.forEach((row) => {
      row.classList.remove("is-sorting", "is-drag-source");
      row.style.removeProperty("transform");
    });
  };
  const cancel = () => {
    cleanup();
  };
  const cancelPointer = (pointer: PointerEvent) => {
    if (pointer.pointerId === event.pointerId) cancel();
  };
  const visibility = () => {
    if (document.hidden) cancel();
  };
  const key = (keyboard: KeyboardEvent) => {
    if (keyboard.key !== "Escape") return;
    keyboard.preventDefault();
    keyboard.stopImmediatePropagation();
    cancel();
  };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== event.pointerId) return;
    x = pointer.clientX;
    y = pointer.clientY;
    update();
  };
  const end = (pointer: PointerEvent) => {
    if (pointer.pointerId !== event.pointerId || !active) return;
    x = pointer.clientX;
    y = pointer.clientY;
    const bounds = scroll.getBoundingClientRect();
    const inside = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    cleanup();
    if (inside && preview.some((item, i) => item !== initial[i])) onCommit(preview);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancelPointer);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("resize", cancel);
  document.addEventListener("visibilitychange", visibility);
  handle.addEventListener("lostpointercapture", cancel);
  frame = requestAnimationFrame(tick);
  return cancel;
}
