import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { hardwareStories, labels } from "./content";

/** A user-controlled story sequence. Slides only change after an explicit click. */
export function KeyboardStory({ icon }: { icon: (name: string) => ReactNode }) {
  const [selected, setSelected] = useState(0);
  const story = hardwareStories[selected];
  const select = (next: number) =>
    setSelected((next + hardwareStories.length) % hardwareStories.length);

  return (
    <div className="keyboard-carousel" aria-label={labels.keyboardStoryLabel}>
      <div className={`keyboard-stage key-${story.key}`} key={story.id} aria-live="polite">
        <div className="keyboard-status">
          <span className="dot" />
          {story.status}
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
            <strong>{story.title}</strong>
            <p>{story.action}</p>
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
        <button type="button" onClick={() => select(selected - 1)} aria-label="上一个键盘故事">
          <ChevronLeft size={17} />
        </button>
        <div className="keyboard-dots" role="group" aria-label="选择键盘互动故事">
          {hardwareStories.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-label={`查看：${item.title}`}
              aria-pressed={index === selected}
              onClick={() => select(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <span className="keyboard-count">0{selected + 1} / 04</span>
        <button type="button" onClick={() => select(selected + 1)} aria-label="下一个键盘故事">
          <ChevronRight size={17} />
        </button>
      </div>
      <p className="keyboard-caption">{labels.macroPadCaption}</p>
    </div>
  );
}
