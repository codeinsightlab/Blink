import { useState } from "react";
import { AppWindow, Globe, Terminal, Command, Repeat2, ArrowRight } from "lucide-react";
import { copy, labels, productViews, showcaseLabels } from "./content";
const actionIcons = [AppWindow, Globe, Terminal, Command, Repeat2];

/** Explicit user-controlled views: no timer, autoplay or external carousel dependency. */
export function ProductShowcase() {
  const [selected, setSelected] = useState(0);
  const view = productViews[selected];
  return (
    <div className="product-showcase">
      <div className="showcase-toolbar">
        <p className="eyebrow">{showcaseLabels.eyebrow}</p>
        <div className="showcase-controls" role="group" aria-label={showcaseLabels.group}>
          {productViews.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={index === selected}
              aria-controls="product-view"
              onClick={() => setSelected(index)}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="showcase-layout" id="product-view" aria-live="polite">
        <figure className="showcase-media">
          <div className="showcase-stage" key={view.id}>
            {view.image ? (
              <img
                src={view.image}
                alt={view.alt}
                width={view.id === "commands" ? 1280 : 1493}
                height={view.id === "commands" ? 720 : 1015}
              />
            ) : (
              <div className="action-preview">
                <h3>{showcaseLabels.actionTitle}</h3>
                <p>{showcaseLabels.actionNote}</p>
                <div className="action-bindings">
                  {copy.features.map(([, title, , status], index) => {
                    const Icon = actionIcons[index];
                    return (
                      <div className="action-binding" key={title}>
                        <kbd>{showcaseLabels.binding}</kbd>
                        <ArrowRight aria-hidden="true" size={18} />
                        <span>
                          <Icon aria-hidden="true" size={22} />
                          {title}
                        </span>
                        {status === labels.soon && <small className="label">{labels.soon}</small>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <figcaption>{view.caption}</figcaption>
        </figure>
        <aside className="showcase-copy">
          <span className="view-number" aria-hidden="true">
            0{selected + 1}
            <small> / 03</small>
          </span>
          <h2>{view.title}</h2>
          <p>{view.description}</p>
          <span className="showcase-detail">{view.detail}</span>
        </aside>
      </div>
    </div>
  );
}
