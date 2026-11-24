import {
  EnvironmentId,
  ThreadId,
  type PullRequestContextMetadata,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { collectComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { hostedThreadLink } from "@t3tools/shared/threadLinks";
import { describe, expect, it } from "vite-plus/test";

import { chipSharedLinks, type SharedLinkReaders } from "./sharedLinkChips";

// Shares go through the real link parsers and chip formatter; only the app's lookups are faked,
// keyed by what each knows, so each case shows which links became chips and which stayed text.
const PR_URL = "https://github.com/l2beat/l2beat/pull/14097";
const THREAD: ScopedThreadRef = {
  environmentId: EnvironmentId.make("env-1"),
  threadId: ThreadId.make("thread-1"),
};
const THREAD_URL = hostedThreadLink(THREAD);

function pullRequest(url: string, number: number): PullRequestContextMetadata {
  return {
    number,
    title: "Sort interop transfers",
    url,
    headBranch: "t3/show-highest-value",
    baseBranch: "main",
    state: "open",
    isDraft: false,
  };
}

function readers(known: {
  readonly pullRequests?: ReadonlyArray<string>;
  readonly threads?: ReadonlyArray<ScopedThreadRef>;
}): SharedLinkReaders {
  return {
    pullRequest: async (url) =>
      known.pullRequests?.includes(url) ? pullRequest(url, 14097) : null,
    threadTitle: (ref) =>
      known.threads?.some(
        (thread) => thread.environmentId === ref.environmentId && thread.threadId === ref.threadId,
      )
        ? "Fix the share sheet"
        : null,
  };
}

describe("chipSharedLinks", () => {
  it("turns a shared pull request URL into a pull request chip", async () => {
    const result = await chipSharedLinks(PR_URL, "share-1", readers({ pullRequests: [PR_URL] }));

    const [reference] = collectComposerContextReferences(result.text);
    expect(result.text).toBe(reference?.source);
    expect(result.context?.records).toEqual([
      expect.objectContaining({
        kind: "review-comment",
        contextId: reference?.contextId,
        label: "#14097",
        pullRequest: pullRequest(PR_URL, 14097),
      }),
    ]);
  });

  it("turns a shared T3 Code thread link into a thread chip", async () => {
    const result = await chipSharedLinks(
      `Continue ${THREAD_URL}`,
      "share-1",
      readers({ threads: [THREAD] }),
    );

    const [reference] = collectComposerContextReferences(result.text);
    expect(result.text).toBe(`Continue ${reference?.source}`);
    expect(result.context?.records).toEqual([
      expect.objectContaining({ kind: "thread", ...THREAD, title: "Fix the share sheet" }),
    ]);
  });

  it("keeps the surrounding text and the links it cannot read", async () => {
    const unknown = "https://github.com/l2beat/l2beat/pull/140971";
    const result = await chipSharedLinks(
      `Review ${PR_URL}, then ${unknown} and ${THREAD_URL}.`,
      "share-1",
      readers({ pullRequests: [PR_URL] }),
    );

    expect(result.text).toMatch(/^Review \S+, then /);
    expect(result.text).not.toContain(`${PR_URL},`);
    expect(result.text).toContain(` then ${unknown} and ${THREAD_URL}.`);
    expect(result.context?.records).toHaveLength(1);
  });

  it("chips a link to a whole-PR tab such as Files changed", async () => {
    const files = `${PR_URL}/files`;
    const result = await chipSharedLinks(files, "share-1", readers({ pullRequests: [files] }));

    expect(result.context?.records).toHaveLength(1);
  });

  it("keeps links to one pull request comment or commit as text", async () => {
    const comment = `${PR_URL}#discussion_r123`;
    const commit = `${PR_URL}/commits/${"a".repeat(40)}`;
    const text = `${comment} ${commit}`;

    expect(
      await chipSharedLinks(text, "share-1", readers({ pullRequests: [comment, commit] })),
    ).toEqual({ text });
  });

  it("leaves the text alone when the server cannot read the pull request", async () => {
    const offline: SharedLinkReaders = {
      ...readers({}),
      pullRequest: async () => {
        throw new Error("offline");
      },
    };

    expect(await chipSharedLinks(`See ${PR_URL}`, "share-1", offline)).toEqual({
      text: `See ${PR_URL}`,
    });
  });
});
