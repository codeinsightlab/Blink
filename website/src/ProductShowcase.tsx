import { useState } from "react";
import { productViews, showcaseLabels } from "./content";

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
          <div className={`showcase-stage stage-${view.id}`} key={view.id}>
            <div className={`showcase-screens screens-${view.images.length}`}>
              {view.images.map((image, index) => (
                <div className="showcase-screen" key={image.src}>
                  {view.images.length > 1 && (
                    <span className="screen-state">{index === 0 ? "捕获中" : "已绑定"}</span>
                  )}
                  <img
                    className="showcase-image"
                    src={image.src}
                    alt={image.alt}
                    width="1280"
                    height="720"
                    fetchPriority={selected === 0 ? "high" : "auto"}
                  />
                </div>
              ))}
            </div>
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
          <span className="showcase-detail">
            <span className="label">{view.id === "binding" ? "示例流程" : "已支持"}</span>
            {view.detail}
          </span>
        </aside>
      </div>
    </div>
  );
}
