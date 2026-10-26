import * as opendocs from "../api/opendocs";
import { hasSession, signIn, signOut } from "../auth/session";
import type { DestinationChoices } from "../messages";
import { getRecords, getVisibility, replaceRecords, setVisibility } from "../store/local";
import { PublishError, type Account, type AuthState, type Destination, type PublishRecord } from "../types";

/**
 * The signed-in side: who it is, where documents go (the workspace and
 * project are kept on the server per connection, like Claude's or
 * ChatGPT's; visibility in the browser), and moving anonymous documents in
 * after signing in. Answers are cached for a minute; the service worker
 * forgets them when it sleeps.
 */

let cache: { at: number; account: Account; destination: Destination | null } | null = null;
const TTL_MS = 60_000;

function forget(): void {
  cache = null;
}

export async function currentDestination(): Promise<Destination | null> {
  return (await load())?.destination ?? null;
}

async function load(): Promise<{ account: Account; destination: Destination | null } | null> {
  if (!(await hasSession())) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const [me, connection, visibility] = await Promise.all([opendocs.me(), opendocs.connection().catch(() => null), getVisibility()]);
  const workspace = connection?.workspace ?? me.onboarding.workspace;
  cache = {
    at: Date.now(),
    account: { username: me.onboarding.username, plan: me.quota.documents?.plan ?? null },
    destination: workspace
      ? { workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug }, project: connection?.project ?? null, visibility }
      : null,
  };
  return cache;
}

export async function authState(): Promise<AuthState> {
  try {
    const loaded = await load();
    return loaded ? { signedIn: true, account: loaded.account, destination: loaded.destination } : { signedIn: false };
  } catch (err) {
    if (err instanceof PublishError && err.code === "signed_out") return { signedIn: false };
    throw err;
  }
}

/** Signs in, then moves this browser's live anonymous documents into the workspace. */
export async function signInAndClaim(): Promise<AuthState & { claimed: number }> {
  await signIn();
  forget();
  const state = await authState();
  if (!state.signedIn || !state.destination) return { ...state, claimed: 0 };
  const { destination } = state;
  const records = await getRecords();
  let claimed = 0;
  const next: PublishRecord[] = [];
  for (const record of records) {
    if (record.kind !== "anonymous") {
      next.push(record);
      continue;
    }
    try {
      const post = await opendocs.claimAnonymous(
        record.claimToken,
        destination.workspace.id,
        destination.project?.id,
        destination.visibility,
      );
      claimed += 1;
      next.push({
        kind: "workspace",
        postId: post.postId,
        workspaceId: destination.workspace.id,
        sourceKey: record.sourceKey,
        site: record.site,
        scope: record.scope,
        title: post.title || record.title,
        url: opendocs.documentUrl(post),
        publishedAt: record.publishedAt,
      });
    } catch {
      // Expired, hidden or over the plan's limit: it stays anonymous until it expires.
      next.push(record);
    }
  }
  await replaceRecords(next);
  return { ...state, claimed };
}

export async function signOutEverywhere(): Promise<AuthState> {
  await signOut();
  forget();
  return { signedIn: false };
}

export async function destinationChoices(): Promise<DestinationChoices> {
  const [{ workspaces }, current] = await Promise.all([opendocs.workspaces(), currentDestination()]);
  const withProjects = await Promise.all(
    workspaces.map(async (workspace) => {
      const { projects } = await opendocs.projects(workspace.id).catch(() => ({ projects: [] as opendocs.Project[] }));
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        projects: projects.map(({ id, name, slug, isDefault }) => ({ id, name, slug, isDefault })),
      };
    }),
  );
  return { workspaces: withProjects, current };
}

export async function chooseDestination(destination: Destination): Promise<AuthState> {
  await opendocs.saveConnection(destination.workspace.id, destination.project?.id ?? null);
  await setVisibility(destination.visibility);
  forget();
  return authState();
}
