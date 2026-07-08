import { describe, expect, it } from "vitest";
import {
  buildReleaseMessage,
  githubMarkdownToSlackMarkdown,
} from "./build-release-notification";

describe("markdownToSlack", () => {
  it("drops the leading version header", () => {
    const input =
      "## [1.43.0](https://github.com/govuk-once/user-data-platform/compare/v1.42.0...v1.43.0) (2026-07-07)\n\n### Features";

    expect(githubMarkdownToSlackMarkdown(input)).toBe("*Features*");
  });

  it("converts headings to Slack bold", () => {
    expect(githubMarkdownToSlackMarkdown("### Bug Fixes")).toBe("*Bug Fixes*");
  });

  it("encodes inline links as Slack links", () => {
    expect(
      githubMarkdownToSlackMarkdown("see [#383](https://example.com/383)"),
    ).toBe("see <https://example.com/383|#383>");
  });

  it("converts GitHub bold to Slack bold", () => {
    expect(githubMarkdownToSlackMarkdown("a **breaking** change")).toBe(
      "a *breaking* change",
    );
  });

  it("converts list markers to bullet points", () => {
    expect(githubMarkdownToSlackMarkdown("* one\n* two")).toBe("• one\n• two");
    expect(githubMarkdownToSlackMarkdown("- one\n- two")).toBe("• one\n• two");
  });

  it("collapses runs of blank lines and trims", () => {
    expect(githubMarkdownToSlackMarkdown("a\n\n\n\nb\n\n")).toBe("a\n\nb");
  });

  it("converts a full semantic-release note into clean Slack mrkdwn", () => {
    const input = [
      "## [1.43.0](https://github.com/govuk-once/user-data-platform/compare/v1.42.0...v1.43.0) (2026-07-07)",
      "",
      "### Features",
      "",
      "* new feature ([01e76da](https://github.com/govuk-once/user-data-platform/commit/01e76da))",
      "",
      "",
    ].join("\n");

    expect(githubMarkdownToSlackMarkdown(input)).toBe(
      "*Features*\n• new feature (<https://github.com/govuk-once/user-data-platform/commit/01e76da|01e76da>)",
    );
  });
});

describe("buildReleaseMessage", () => {
  const url = "https://github.com/govuk-once/user-data-platform/releases/tag/v1.43.0";

  it("builds the Chatbot custom-notification envelope", () => {
    const message = buildReleaseMessage({
      title: "UDP minor release: v1.43.0",
      notesMarkdown: "### Features\n\n* new feature",
      url,
    });

    expect(message).toEqual({
      version: "1.0",
      source: "custom",
      content: {
        textType: "client-markdown",
        title: "UDP minor release: v1.43.0",
        description: `*Features*\n• new feature\n\n<${url}|View release>`,
      },
    });
  });

  it("includes only the link when there are no notes", () => {
    const message = buildReleaseMessage({
      title: "UDP minor release: v1.43.0",
      notesMarkdown: "",
      url,
    });

    expect(message.content.description).toBe(`<${url}|View release>`);
  });

  it("truncates long notes", () => {
    const message = buildReleaseMessage({
      title: "UDP minor release: v1.43.0`",
      notesMarkdown: "x".repeat(5000),
      url,
    });

    expect(message.content.description).toBe(
      `${"x".repeat(1500)}\n\n<${url}|View release>`,
    );
  });
});
