import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type {
  ComposerContextRecord,
  OrchestrationMessageContext,
  PullRequestContextMetadata,
  ScopedThreadRef,
} from "@t3tools/contracts";
import {
  formatComposerContextReference,
  threadContextRecord,
} from "@t3tools/shared/composerContextReferences";
import { parsePullRequestAnchor } from "@t3tools/shared/pullRequestAnchor";
import { parseThreadLinkHref } from "@t3tools/shared/threadLinks";

import { pullRequestComposerContext } from "../../lib/composerContext";

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/** What the app can look up to turn a shared link into the chip the composer would add. */
export interface SharedLinkReaders {
  readonly pullRequest: (url: string) => Promise<PullRequestContextMetadata | null>;
  readonly threadTitle: (ref: ScopedThreadRef) => string | null;
}

/**
 * Swaps each pull request or T3 Code thread link the app can read for the chip the composer's
 * `#` and `@` menus add. Ids derive from the share so a retried import writes the same text and is
 * recognized as a duplicate. A link it cannot read stays a plain URL.
 */
export async function chipSharedLinks(
  text: string,
  shareId: string,
  readers: SharedLinkReaders,
): Promise<{ readonly text: string; readonly context?: OrchestrationMessageContext }> {
  const idPrefix = `share-link_${shareId.replace(/[^a-z0-9_-]/gi, "").slice(0, 80)}`;
  const resolved = await Promise.all(
    sharedUrls(text).map(async (url, index) => {
      const record = await chipFor(url, `${idPrefix}_${index}`, readers);
      return record ? ([url, record] as const) : null;
    }),
  );
  const chips = new Map(resolved.filter((entry) => entry !== null));
  if (chips.size === 0) return { text };
  const chipped = text.replace(URL_IN_TEXT, (match) => {
    const url = match.replace(TRAILING_PUNCTUATION, "");
    const record = chips.get(url);
    return record ? formatComposerContextReference(record) + match.slice(url.length) : match;
  });
  return { text: chipped, context: { version: 1, records: [...chips.values()] } };
}

/** Links in shared text, as written, each once. */
function sharedUrls(text: string): ReadonlyArray<string> {
  return [
    ...new Set(
      Array.from(text.matchAll(URL_IN_TEXT), ([match]) => match.replace(TRAILING_PUNCTUATION, "")),
    ),
  ];
}

async function chipFor(
  url: string,
  id: string,
  readers: SharedLinkReaders,
): Promise<ComposerContextRecord | null> {
  const thread = parseThreadLinkHref(url);
  if (thread?.environmentId) {
    const ref = { environmentId: thread.environmentId, threadId: thread.threadId };
    const title = readers.threadTitle(ref);
    return title === null ? null : threadContextRecord(ref, title);
  }
  // A link to one comment or diff line would lose what it points at as a whole-PR chip.
  if (
    sourceControlClients.parseChangeRequestUrl(url)?.link === undefined ||
    parsePullRequestAnchor(url) !== null
  )
    return null;
  const pullRequest = await readers.pullRequest(url).catch(() => null);
  return pullRequest ? pullRequestComposerContext(pullRequest, id) : null;
}
