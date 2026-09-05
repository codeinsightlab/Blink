import { useState } from "react";
import { productViews, showcaseLabels } from "./content";

/** Explicit user-controlled views: no timer, autoplay or external carousel dependency. */
// Cloudflare Preview verification marker; behavior and product copy remain unchanged.
export function ProductShowcase({ language = "zh" }: { language?: "zh" | "en" }) {
  const [selected, setSelected] = useState(0);
  const view = productViews[selected];
  const viewCopy = language === "en" ? {
    commands: { label: "Command Deck", title: "All your commands, here.", description: "See the commands you created, their action sources, and binding status at a glance.", detail: "Real Runtime UI" },
    create: { label: "Create command", title: "Choose an action. Name it.", description: "Creator brings action type, target, and command name into one clear view.", detail: "Real Creator UI" },
    binding: { label: "Bind a key", title: "Press a physical key to bind it.", description: "Blink enters capture mode, saves the physical key, and shows the resulting keycap.", detail: "Real Runtime binding state" },
  }[view.id] : view;
  return (
    <div className="product-showcase">
      <div className="showcase-toolbar">
        <p className="eyebrow">{language === "en" ? "BLINK, FROM COMMAND TO KEY" : showcaseLabels.eyebrow}</p>
        <div className="showcase-controls" role="group" aria-label={language === "en" ? "Switch product view" : showcaseLabels.group}>
          {productViews.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={index === selected}
              aria-controls="product-view"
              onClick={() => setSelected(index)}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {language === "en" ? viewCopyFor(item.id).label : item.label}
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
                    <span className="screen-state">{index === 0 ? (language === "en" ? "Capturing" : "捕获中") : language === "en" ? "Bound" : "已绑定"}</span>
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
          <figcaption>{language === "en" ? "Real Runtime interface" : view.caption}</figcaption>
        </figure>
        <aside className="showcase-copy">
          <span className="view-number" aria-hidden="true">
            0{selected + 1}
            <small> / 03</small>
          </span>
          <h2>{viewCopy.title}</h2>
          <p>{viewCopy.description}</p>
          <span className="showcase-detail">
            <span className="label">{view.id === "binding" ? (language === "en" ? "Example flow" : "示例流程") : language === "en" ? "Supported" : "已支持"}</span>
            {viewCopy.detail}
          </span>
        </aside>
      </div>
    </div>
  );
}

function viewCopyFor(id: string) {
  return {
    commands: { label: "Command Deck" },
    create: { label: "Create command" },
    binding: { label: "Bind a key" },
  }[id as "commands" | "create" | "binding"];
}
