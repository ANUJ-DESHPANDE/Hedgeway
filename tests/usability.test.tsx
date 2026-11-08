import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { portfolio } from "../src/analytics";
import Overview from "../src/pages/Overview";
import PortfolioView from "../src/pages/PortfolioView";
import ImportModal from "../src/pages/ImportModal";
import Research from "../src/pages/Research";
import Lab from "../src/pages/Lab";
const noop = () => {};
const action = async () => true;
describe("first-use and unavailable-data workflows (static component rendering)", () => {
  it("offers useful next steps without a wall of empty portfolio metrics", () => {
    const html = renderToStaticMarkup(
      <Overview
        data={{
          portfolio: portfolio([], []),
          quotes: [],
          articles: [],
          ipos: [],
        }}
        mode="workspace"
        go={noop}
        importCSV={noop}
        watch={[]}
        onWatch={noop}
      />,
    );
    expect(html).toContain("Import my holdings");
    expect(html).toContain("Open market workspace");
    expect(html).toContain("Open research");
    expect(html).not.toContain("PORTFOLIO VALUE");
  });
  it("does not show unusable risk controls for an empty portfolio", () => {
    const html = renderToStaticMarkup(
      <PortfolioView
        portfolio={portfolio([], [])}
        mode="workspace"
        importCSV={noop}
        busy={false}
        action={action}
        go={noop}
      />,
    );
    expect(html).toContain("Choose holdings file");
    expect(html).toContain("Connect Kite");
    expect(html).not.toContain('type="range"');
  });
  it("requires file review before presenting an import action", () => {
    const html = renderToStaticMarkup(
      <ImportModal onClose={noop} onImport={async () => {}} />,
    );
    expect(html).toContain("Step 1 of 2");
    expect(html).toContain("Review holdings");
    expect(html).not.toContain("Validate &amp; import");
  });
  it("routes an unconfigured Reddit connection to setup rather than a failing sync", () => {
    const html = renderToStaticMarkup(
      <Research
        mode="workspace"
        action={action}
        busy={false}
        version={0}
        redditReady={false}
        go={noop}
      />,
    );
    expect(html).toContain("Connect Reddit");
    expect(html).not.toContain("Sync Reddit");
  });
  it("explains the missing history source and disables an unavailable experiment", () => {
    const html = renderToStaticMarkup(
      <Lab mode="workspace" connected={false} go={noop} show={noop} />,
    );
    expect(html).toContain("Connect prices");
    expect(html).toMatch(/<button class="primary" disabled="">/);
    expect(html).toContain("Strategy settings");
  });
});
