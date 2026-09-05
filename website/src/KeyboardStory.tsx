import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { hardwareStories, labels } from "./content";

/** A user-controlled story sequence. Slides only change after an explicit click. */
export function KeyboardStory({ icon, language = "zh" }: { icon: (name: string) => ReactNode; language?: "zh" | "en" }) {
  const [selected, setSelected] = useState(0);
  const story = hardwareStories[selected];
  const storyCopy = language === "en" ? {
    "open-app": { title: "Press once to open an app", action: "Key 1 → Open ChatGPT", status: "Open app" },
    "return-work": { title: "Press once to return to work", action: "Key 2 → Launch VS Code", status: "Back to work" },
    "toggle-app": { title: "Call it forward, then hide it", action: "Key 3 → Show / hide ChatGPT", status: "Coming soon · App toggle" },
    "clear-action": { title: "One press, one clear action", action: "One key maps to one independent result", status: "More actions" },
  }[story.id] : story;
  const select = (next: number) =>
    setSelected((next + hardwareStories.length) % hardwareStories.length);

  return (
    <div className="keyboard-carousel" aria-label={language === "en" ? "Keyboard interaction story" : labels.keyboardStoryLabel}>
      <div className={`keyboard-stage key-${story.key}`} key={story.id} aria-live="polite">
        <div className="keyboard-status">
          <span className="dot" />
          {storyCopy.status}
        </div>
        <img
          src="/macro-pad.png"
          alt={labels.macroPadAlt}
          width="1600"
          height="1600"
          loading="lazy"
        />
        <span className="key-highlight" aria-hidden="true" />
        <div className="story-response">
          <span className="story-step">0{selected + 1}</span>
          <span className="story-icon">{icon(story.icon)}</span>
          <div>
            <strong>{storyCopy.title}</strong>
            <p>{storyCopy.action}</p>
          </div>
        </div>
        {"alternatives" in story && story.alternatives && (
          <div className="story-alternatives">
            {story.alternatives.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
        <div className="story-connection" aria-hidden="true">
          <span />
          <ArrowRight size={15} />
        </div>
      </div>
      <div className="keyboard-nav">
        <button type="button" onClick={() => select(selected - 1)} aria-label={language === "en" ? "Previous keyboard story" : "上一个键盘故事"}>
          <ChevronLeft size={17} />
        </button>
        <div className="keyboard-dots" role="group" aria-label={language === "en" ? "Choose a keyboard story" : "选择键盘互动故事"}>
          {hardwareStories.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-label={language === "en" ? `View story ${index + 1}` : `查看：${item.title}`}
              aria-pressed={index === selected}
              onClick={() => select(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <span className="keyboard-count">0{selected + 1} / 04</span>
        <button type="button" onClick={() => select(selected + 1)} aria-label={language === "en" ? "Next keyboard story" : "下一个键盘故事"}>
          <ChevronRight size={17} />
        </button>
      </div>
      <p className="keyboard-caption">{language === "en" ? "Hardware is illustrative; Blink does not depend on a specific keyboard model." : labels.macroPadCaption}</p>
    </div>
  );
}
