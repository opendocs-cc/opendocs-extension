import { browser } from "wxt/browser";
import * as opendocs from "../api/opendocs";
import { hasSession } from "../auth/session";
import { ANONYMOUS_MAX_BYTES } from "../config";
import { placeImages } from "../markdown/document";
import { findRecord, saveRecord } from "../store/local";
import { PublishError, type DocumentDraft, type PublishRecord, type PublishResult } from "../types";
import { currentDestination } from "./account";

const SIGNED_OUT_IMAGE_NOTE = "Image not included. Sign in to OpenDocs to keep images.";
const FAILED_IMAGE_NOTE = "Image not included.";

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function publishDraft(draft: DocumentDraft, mode: "new" | "update"): Promise<PublishResult> {
  const previous = mode === "update" ? await findRecord(draft.sourceKey) : null;
  return (await hasSession()) ? publishSignedIn(draft, previous) : publishAnonymously(draft, previous);
}

async function publishSignedIn(draft: DocumentDraft, previous: PublishRecord | null): Promise<PublishResult> {
  const destination = await currentDestination();
  if (!destination) throw new PublishError("unknown", "Your account has no workspace yet. Open opendocs.cc to finish setting it up.");
  const workspaceId = previous?.kind === "workspace" ? previous.workspaceId : destination.workspace.id;

  const uploaded = new Map<string, string>();
  let imagesSkipped = 0;
  for (const image of draft.images) {
    try {
      uploaded.set(image.ref, await opendocs.uploadImage(workspaceId, bytesOf(image.data), image.contentType, image.filename));
    } catch {
      imagesSkipped += 1;
    }
  }
  const markdown = placeImages(draft.markdown, uploaded, FAILED_IMAGE_NOTE);
  imagesSkipped += (draft.markdown.match(/\(opendocs-image:\d+\)/g)?.length ?? 0) - draft.images.length;

  const updating = previous?.kind === "workspace";
  const post = updating
    ? await opendocs.update(draft.site, previous.postId, previous.workspaceId, markdown, draft.title)
    : await opendocs.publish(draft.site, {
        markdown,
        title: draft.title,
        workspaceId,
        projectId: destination.project?.id,
        visibility: destination.visibility,
      });

  const record: PublishRecord = {
    kind: "workspace",
    postId: post.postId,
    workspaceId,
    sourceKey: draft.sourceKey,
    site: draft.site,
    scope: draft.scope,
    title: post.title || draft.title,
    url: opendocs.documentUrl(post),
    publishedAt: new Date().toISOString(),
  };
  await saveRecord(record);
  return { record, updated: updating, imagesSkipped: Math.max(0, imagesSkipped) };
}

async function publishAnonymously(draft: DocumentDraft, previous: PublishRecord | null): Promise<PublishResult> {
  const markdown = placeImages(draft.markdown, new Map(), SIGNED_OUT_IMAGE_NOTE);
  if (new TextEncoder().encode(markdown).byteLength > ANONYMOUS_MAX_BYTES) {
    throw new PublishError("too_long_anonymous", "This is too long to publish without an account. Sign in (it's free) to publish it.");
  }
  const imagesSkipped = draft.markdown.match(/\(opendocs-image:\d+\)/g)?.length ?? 0;

  if (previous?.kind === "anonymous") {
    const doc = await opendocs.updateAnonymous(draft.site, previous.anonymousId, previous.claimToken, markdown, draft.title);
    const record: PublishRecord = { ...previous, title: doc.title || draft.title, publishedAt: new Date().toISOString() };
    await saveRecord(record);
    return { record, updated: true, imagesSkipped };
  }

  const doc = await opendocs.publishAnonymous(draft.site, markdown, draft.title);
  const record: PublishRecord = {
    kind: "anonymous",
    anonymousId: doc.id,
    claimToken: doc.claimToken,
    expiresAt: doc.expiresAt,
    sourceKey: draft.sourceKey,
    site: draft.site,
    scope: draft.scope,
    title: doc.title || draft.title,
    url: doc.url,
    publishedAt: new Date().toISOString(),
  };
  await saveRecord(record);
  return { record, updated: false, imagesSkipped };
}

/** Opens a PDF or Word download for a published document in a new tab. */
export async function openDownload(record: PublishRecord, format: "pdf" | "docx"): Promise<void> {
  let url: string;
  if (record.kind === "anonymous") {
    if (format !== "pdf") throw new PublishError("pro_only", "Word files need an OpenDocs account on Pro.");
    url = opendocs.anonymousPdfUrl(record.anonymousId);
  } else {
    url = (await opendocs.downloadLink(record.postId, record.workspaceId, format)).url;
  }
  await browser.tabs.create({ url, active: false });
}
