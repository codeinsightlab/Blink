import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Download,
  Command,
  Terminal,
  Code2,
  GitBranch,
  Globe,
  Store,
  MessageSquare,
  LayoutDashboard,
  ChartNoAxesCombined,
  Mail,
  FileText,
  Folder,
  AppWindow,
  Keyboard,
  Repeat2,
  Check,
} from "lucide-react";
import { ProductShowcase } from "./ProductShowcase";
import { KeyboardStory } from "./KeyboardStory";
import { copy as baseCopy, copyEn, labels as baseLabels, labelsEn, hardwareValues } from "./content";
import { resolveLatestDownload, WINDOWS_DOWNLOAD_FALLBACK } from "./downloads";
const icons: Record<string, typeof Command> = {
  code: Code2,
  terminal: Terminal,
  github: GitBranch,
  globe: Globe,
  store: Store,
  message: MessageSquare,
  layout: LayoutDashboard,
  chart: ChartNoAxesCombined,
  mail: Mail,
  file: FileText,
  folder: Folder,
  app: AppWindow,
  command: Command,
  switch: Repeat2,
};
function Icon({ name }: { name: string }) {
  const C = icons[name] || Command;
  return <C aria-hidden="true" size={24} />;
}
function Brand({ labels }: { labels: typeof baseLabels }) {
  return (
    <a className="brand" href="#top" aria-label={labels.homeLabel}>
      <img src="/blink.svg" alt="" width="36" height="36" />
      <span>{labels.brand}</span>
    </a>
  );
}

function initialLanguage(): "zh" | "en" {
  if (typeof document !== "undefined") {
    const bootstrapped = document.documentElement.dataset.locale;
    if (bootstrapped === "zh" || bootstrapped === "en") return bootstrapped;
  }
  try {
    const saved = window.localStorage.getItem("blink-language");
    if (saved === "zh" || saved === "en") return saved;
  } catch {}
  return typeof navigator === "undefined" || navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export default function App() {
  const [scenario, setScenario] = useState(0);
  const [language, setLanguage] = useState<"zh" | "en">(initialLanguage);
  const [downloadUrl, setDownloadUrl] = useState(WINDOWS_DOWNLOAD_FALLBACK);
  const labels = language === "en" ? { ...baseLabels, ...labelsEn } : baseLabels;
  const copy = language === "en" ? copyEn : baseCopy;
  const active = copy.scenarios[scenario];

  useEffect(() => {
    resolveLatestDownload("windows")
      .then((url) => { if (url) setDownloadUrl(url); })
      .catch(() => undefined);
  }, []);

  const changeLanguage = (next: "zh" | "en") => {
    setLanguage(next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.locale = next;
    try {
      window.localStorage.setItem("blink-language", next);
    } catch {}
  };

  const primaryCta = { href: downloadUrl, label: labels.download };
  return (
    <>
      <a className="skip" href="#main">
        {labels.skip}
      </a>
      <header>
        <nav className="nav container" aria-label={labels.navLabel}>
          <Brand labels={labels} />
          <button className="language-toggle" type="button" onClick={() => changeLanguage(language === "en" ? "zh" : "en")} aria-label={language === "en" ? "切换为中文" : "Switch to English"}>
            {language === "en" ? "中文" : "EN"}
          </button>
          <div className="nav-links">
            <a href="#features">{labels.navFeatures}</a>
            <a href="#scenarios">{labels.navScenarios}</a>
            <a href="#how">{labels.navHow}</a>
          </div>
          <a className="nav-cta" href={primaryCta.href}>
            {primaryCta.label}
            <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero container" id="top">
          <a className="eyebrow hero-badge" href="#features">
            <span className="dot" />
            {copy.hero.badge}
            <ArrowRight size={13} />
          </a>
          <h1>
            {copy.hero.title[0]}
            <br />
            <span>{copy.hero.title[1]}</span>
          </h1>
          <p className="hero-description">{copy.hero.description}</p>
          <div className="actions">
            <a className="button primary" href={primaryCta.href}>
              <Download size={17} />
              {primaryCta.label}
              <ArrowRight size={16} />
            </a>
            <a className="button secondary" href="#features">
              {labels.learn}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <p className="availability">
            {labels.macFirst}
            <span>{labels.separator}</span>
            {labels.macStatus}
          </p>
          <ProductShowcase language={language} />
          <div className="hero-foot">
            <span>
              <Keyboard size={15} />
              {labels.physicalKeys}
            </span>
            <span>
              <Command size={15} />
              {labels.oneKey}
            </span>
            <span>
              <Check size={15} />
              {labels.noFirmware}
            </span>
          </div>
        </section>
        <section className="section container" id="scenarios">
          <div className="section-heading">
            <p className="eyebrow">{labels.scenariosEyebrow}</p>
            <h2>
              {labels.scenariosTitle}
              <span>{labels.scenariosTitleAccent}</span>
            </h2>
            <p>{labels.scenariosDescription}</p>
          </div>
          <div className="tabs" role="group" aria-label={labels.scenarioLabel}>
            {copy.scenarios.map((s, i) => (
              <button key={s.name} aria-pressed={scenario === i} onClick={() => setScenario(i)}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="scenario-panel" aria-live="polite">
            <div className="scenario-copy">
              <p className="eyebrow">{active.tag}</p>
              <h3>{active.title}</h3>
              <p>{active.description}</p>
              <span className="label">{labels.exampleStatus}</span>
              <span className="small-note">{labels.scenarioNote}</span>
            </div>
            <div className="key-grid">
              {active.items.map(([key, name, description, icon], index) => (
                <div className="key-item" key={`${scenario}-${index}-${icon}-${name}`}>
                  <div className={"app-icon " + icon}>
                    <Icon name={icon} />
                  </div>
                  <h4>{name}</h4>
                  <p>{description}</p>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="section container" id="keys">
          <div className="hardware-story showcase-surface">
            <div className="hardware-copy">
              <p className="eyebrow">{labels.keysEyebrow}</p>
              <h2>
                {labels.keysTitle}
                <br />
                <span>{labels.keysTitleAccent}</span>
              </h2>
              <p className="hardware-intro">{labels.keysDescription}</p>
              <div className="hardware-values">
                {hardwareValues.map(([title, description]) => (
                  <div key={title}>
                    <Check aria-hidden="true" size={15} />
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="small-note">{labels.keysNote}</p>
            </div>
            <KeyboardStory language={language} icon={(name) => <Icon name={name} />} />
          </div>
        </section>
        <section className="section container" id="features">
          <div className="section-heading">
            <p className="eyebrow">{labels.featuresEyebrow}</p>
            <h2>
              {labels.featuresTitle}
              <span>{labels.featuresTitleAccent}</span>
            </h2>
            <p>{labels.featuresDescription}</p>
          </div>
          <div className="feature-grid">
            {copy.features.map(([icon, title, description, status]) => (
              <article className="feature-card" key={title}>
                <div className="feature-top">
                  <Icon name={icon} />
                  <span className={status === "即将支持" || status === "Coming soon" ? "label pending-label" : "label supported-label"}>
                    {status}
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="section container firmware">
          <div>
            <p className="eyebrow">{labels.firmwareEyebrow}</p>
            <h2>
              {labels.firmwareTitle}
              <br />
              <span>{labels.firmwareTitleAccent}</span>
            </h2>
          </div>
          <div>
            <p className="firmware-lead">
              {labels.firmwareLead}
              <br />
              {labels.firmwareLeadEnd}
            </p>
            <p>{labels.firmwareDescription}</p>
            <div className="check-list">
              <span>
                <Check size={16} />
                {labels.softwareConfig}
              </span>
              <span>
                <Check size={16} />
                {labels.editAnytime}
              </span>
              <span>
                <Check size={16} />
                {labels.keyboardTypes}
              </span>
            </div>
            <p className="small-note">{labels.firmwareNote}</p>
          </div>
        </section>
        <section className="section container" id="how">
          <div className="section-heading">
            <p className="eyebrow">{labels.howEyebrow}</p>
            <h2>
              {labels.howTitle}
              <span>{labels.howTitleAccent}</span>
            </h2>
          </div>
          <div className="steps">
            {copy.steps.map(([n, title, description]) => (
              <article key={n}>
                <span className="step-number">{n}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="download-section container" id="download">
          <img src="/blink.svg" alt="Blink" width="76" height="76" />
          <p className="eyebrow">{labels.downloadEyebrow}</p>
          <h2>
            {labels.downloadTitle}
            <br />
            {labels.downloadTitleAccent}
          </h2>
          <p>{labels.tagline}</p>
          <a className="button primary" href={downloadUrl}>
            <Download size={17} />
            {labels.download}
          </a>
          <p className="download-note">{labels.downloadNote}</p>
          <div className="platforms">
            <span>
              {labels.mac}
              <b>{labels.macStatus}</b>
            </span>
            <span>
              {labels.windows}
              <b>{labels.windowsStatus}</b>
            </span>
          </div>
        </section>
      </main>
      <footer className="container">
        <div className="footer-top">
          <div>
            <Brand labels={labels} />
            <p>{labels.footerTagline}</p>
          </div>
          <div className="footer-links">
            <div>
              <h4>{labels.product}</h4>
              <a href="#features">{labels.navFeatures}</a>
              <a href="#download">{labels.footerDownload}</a>
            </div>
            <div>
              <h4>{labels.support}</h4>
              <a href={"mailto:" + copy.email}>
                {labels.emailFeedback}
                <ArrowUpRight size={13} />
              </a>
              <p>
                {labels.feedbackLine1}
                <br />
                {labels.feedbackLine2}
              </p>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{labels.copyright}</span>
          <a href={"mailto:" + copy.email}>{copy.email}</a>
          <span>{labels.footerEnglish}</span>
        </div>
      </footer>
    </>
  );
}
