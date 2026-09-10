import changelog from "./changelog.json";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

type Language = "zh" | "en";
type LocalizedText = Record<Language, string>;
type Entry = {
  version: string;
  releaseDate: string;
  summary: LocalizedText;
  added?: LocalizedText[];
  improved?: LocalizedText[];
  fixed?: LocalizedText[];
  knownIssues?: LocalizedText[];
};

const sectionNames = {
  zh: { added: "新增", improved: "改进", fixed: "修复", knownIssues: "已知问题" },
  en: { added: "Added", improved: "Improved", fixed: "Fixed", knownIssues: "Known Issues" },
} as const;

export const changelogMeta = {
  title: "Blink Changelog - Release Notes & Updates",
  description: "See what's new in Blink. Browse release notes, new features, improvements and bug fixes for Blink on macOS and Windows.",
};

export const versionAnchor = (version: string) => `v${version.replaceAll(".", "-")}`;

export function Changelog({ language, onLanguageChange }: { language: Language; onLanguageChange?: (language: Language) => void }) {
  const entries = changelog as Entry[];
  const ui = language === "zh"
    ? { back: "返回首页", title: "Blink 更新日志", intro: "查看 Blink 的新功能、体验改进与问题修复。", latest: "最新版本", released: "发布于", nav: "更新日志导航" }
    : { back: "Back to home", title: "Blink Changelog", intro: "The latest features, improvements, and fixes in Blink.", latest: "Latest release", released: "Released", nav: "Changelog navigation" };

  return (
    <>
      <a className="skip" href="#main">{language === "zh" ? "跳转到正文" : "Skip to content"}</a>
      <header>
        <nav className="nav container" aria-label={ui.nav}>
          <a className="brand" href="/" aria-label={ui.back}><img src="/blink.svg" alt="" width="36" height="36" /><span>Blink</span></a>
          <button className="language-toggle" type="button" onClick={() => onLanguageChange?.(language === "en" ? "zh" : "en")}>{language === "en" ? "中文" : "EN"}</button>
          <a className="nav-cta" href="/"><ArrowLeft size={14} />{ui.back}</a>
        </nav>
      </header>
      <main id="main" className="changelog-page container">
        <section className="changelog-hero">
          <p className="eyebrow">WHAT'S NEW</p>
          <h1>{ui.title}</h1>
          <p>{ui.intro}</p>
        </section>
        <div className="changelog-layout">
          <aside aria-label={ui.nav}>
            <strong>{ui.latest}</strong>
            <nav>{entries.map((entry) => <a key={entry.version} href={`#${versionAnchor(entry.version)}`}>v{entry.version}</a>)}</nav>
          </aside>
          <div className="release-list">
            {entries.map((entry, index) => (
              <article className="release-entry" key={entry.version} aria-labelledby={versionAnchor(entry.version)}>
                <div className="release-heading">
                  <div>
                    {index === 0 && <span className="release-latest">{ui.latest}</span>}
                    <h2 id={versionAnchor(entry.version)}>Blink v{entry.version}</h2>
                  </div>
                  <time dateTime={entry.releaseDate}>{ui.released} {entry.releaseDate}</time>
                </div>
                <p className="release-summary">{entry.summary[language]}</p>
                {(["added", "improved", "fixed", "knownIssues"] as const).map((key) => entry[key]?.length ? (
                  <section className="release-section" key={key}>
                    <h3>{sectionNames[language][key]}</h3>
                    <ul>{entry[key]!.map((item, itemIndex) => <li key={itemIndex}>{item[language]}</li>)}</ul>
                  </section>
                ) : null)}
                <a className="release-anchor" href={`#${versionAnchor(entry.version)}`} aria-label={`Link to Blink v${entry.version}`}><ArrowUpRight size={13} />#{versionAnchor(entry.version)}</a>
              </article>
            ))}
          </div>
        </div>
      </main>
      <footer className="container changelog-footer"><span>© 2026 Blink</span><a href="/">blink.learnaiwithcode.com</a></footer>
    </>
  );
}
