/**
 * @docgraph/plugin-api — type definitions for DocGraph plugins (ADR 0020).
 *
 * **Types only.** The runtime `app` object is built by the host and passed to
 * your `onload(app)`; you never construct it. Author a plugin as an ESM module
 * whose default export implements {@link DocGraphPlugin}:
 *
 * ```ts
 * import type { DocGraphPlugin } from "@docgraph/plugin-api";
 * export default {
 *   async onload(app) {
 *     const files = await app.vault.list();
 *     app.ui.registerPanel({ id: "hello", title: "Hello", icon: "star",
 *       mount(el) { el.textContent = `${files.length} files`; } });
 *   },
 *   onunload() { /* clear your own timers/async here */ },
 * } satisfies DocGraphPlugin;
 * ```
 *
 * Every call is **permission-gated**: declare what you use in `manifest.json`
 * `"permissions"`, or the call is refused with a console warning. See the
 * README for the manifest shape, the CSS-token contract, and the
 * author-owned-teardown rule.
 */

/** Light/dark mode, mirroring the host's `.dark` class on `<html>`. */
export type ThemeMode = "light" | "dark";

/** A plugin's lifecycle object — your module's default export. */
export interface DocGraphPlugin {
  /** Called once after the plugin loads. Register your UI/commands here. */
  onload(app: DocGraphApp): void | Promise<void>;
  /** Called on disable/unload. Clear YOUR OWN timers + in-flight async here —
   *  the host cannot see them (see README → Teardown). */
  onunload?(): void | Promise<void>;
}

/** A ⌘K command. Requires `ui:command`. */
export interface PluginCommand {
  id: string;
  title: string;
  subtitle?: string;
  /** Display-only hint, e.g. "⌘⇧W" (binding is not wired in v1). */
  shortcut?: string;
  available?: () => boolean;
  run: () => void | Promise<void>;
}

/** A right-sidebar panel. Requires `ui:panel`. */
export interface PanelSpec {
  id: string;
  title: string;
  hint?: string;
  /** A frozen icon key (see README → Icons); unknown → a puzzle icon. */
  icon?: string;
  mount: (el: HTMLElement) => void;
  unmount?: () => void;
}

/** Tone for a panel's tab badge. `warning` paints it amber. */
export type BadgeTone = "default" | "warning";

/** Handle returned by `registerPanel` to drive the tab's count badge. */
export interface PanelHandle {
  /** Set (or clear, with `null`) the count badge on the panel's rail tab. */
  setBadge(count: number | null, tone?: BadgeTone): void;
}

/** A broken `<a href>` in the vault (`vault.brokenLinks`). */
export interface BrokenLink {
  fromPath: string;
  toPath: string;
  hrefRaw: string;
  /** Byte offset of the `<a` tag in `fromPath` — pass to `openFile`. */
  sourceByteOffset: number;
  snippet: string | null;
}

/** A node in the vault link graph (`vault.linkGraph`). */
export interface GraphNode {
  id: string;
  folder: string;
  orphan: boolean;
  /** Global PageRank, normalized so the top-ranked node is 1.0. (v1.1) */
  score: number;
  /** The file's tags, user tags first; empty when untagged. (v1.1) */
  tags: string[];
}

/** A directed edge in the vault link graph. */
export interface GraphEdge {
  source: string;
  target: string;
  rel: string | null;
}

/** The vault link graph snapshot (`vault.linkGraph`). */
export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * An undirected semantic ("ghost") edge (`vault.semanticEdges`): two files
 * whose embeddings say they belong together, but that share no real link.
 * (v1.1)
 */
export interface SemanticEdge {
  source: string;
  target: string;
  /** Cosine similarity of the two files' embeddings, [0, 1]. */
  similarity: number;
}

export interface SettingsTabSpec {
  id: string;
  title: string;
  mount: (el: HTMLElement) => void;
  unmount?: () => void;
}

export interface ModalSpec {
  title: string;
  mount: (el: HTMLElement) => void;
  unmount?: () => void;
}

export interface ModalHandle {
  close: () => void;
}

/** Read access to the host's design system. */
export interface ThemeApi {
  current(): ThemeMode;
  onChange(cb: (mode: ThemeMode) => void): () => void;
  /** The frozen CSS custom-property names to style against. */
  readonly tokens: readonly string[];
}

export interface VaultApi {
  /** All `.html` files (vault-relative). Requires `vault:read`. */
  list(): Promise<string[]>;
  /** Read a file's text (LF-normalized). Requires `vault:read`. */
  read(path: string): Promise<string>;
  /** Overwrite a file's text. Requires `vault:write`. */
  write(path: string, contents: string): Promise<void>;
  /** Fire after the index settles (file added/removed/edited). Requires
   *  `events`. Returns an unsubscribe fn. */
  watch(cb: () => void): () => void;
  /** Every broken `<a href>` in the vault. Requires `vault:read`. */
  brokenLinks(): Promise<BrokenLink[]>;
  /** The vault link graph (all files + edges). Requires `vault:read`. */
  linkGraph(): Promise<GraphSnapshot>;
  /** Semantic ("ghost") edges — unlinked-but-related file pairs from the
   *  local embedding index; empty when the AI index isn't built. Requires
   *  `vault:read`. (v1.1, additive) */
  semanticEdges(): Promise<SemanticEdge[]>;
}

/** Options for opening a file in the viewer. */
export interface OpenFileOptions {
  /** Scroll the source/inline view to this byte offset after opening. */
  scrollToByteOffset?: number;
}

export interface WorkspaceApi {
  openFile(path: string, opts?: OpenFileOptions): void;
  activeFile(): string | null;
  onActiveFileChange(cb: (path: string | null) => void): () => void;
}

export interface UiApi {
  /** Register a sidebar panel; returns a handle to drive its tab badge. */
  registerPanel(spec: PanelSpec): PanelHandle;
  addRibbonIcon(icon: string, title: string, onClick: () => void): void;
  registerSettingsTab(spec: SettingsTabSpec): void;
  openModal(spec: ModalSpec): ModalHandle;
  theme: ThemeApi;
  /** Maximize / restore the right sidebar (fullscreen overlay). Requires
   *  `ui:panel`. */
  setPanelExpanded(expanded: boolean): void;
  /** Current expand state of the right sidebar. */
  isPanelExpanded(): boolean;
}

export interface CommandsApi {
  register(command: PluginCommand): void;
  /** Invoke a command by its namespaced id (`<pluginId>.<id>`). */
  invoke(id: string): void;
}

/** Host capabilities passed to a slash command's `run`. */
export interface EditorSlashContext {
  query: string;
  insertInline: (html: string) => void;
  /** Not yet supported — throws until block-insert lands (ADR 0022). */
  insertBlock: (html: string) => void;
}

/** A `/`-triggered inline-editor command contributed by a plugin. */
export interface EditorSlashCommand {
  id: string;
  title: string;
  hint?: string;
  group?: string;
  icon?: string;
  keywords?: string[];
  run: (ctx: EditorSlashContext) => void | Promise<void>;
}

export interface EditorApi {
  /** Contribute a `/`-triggered inline-editor command. Returns a disposer.
   *  Needs the `ui:command` permission. */
  registerSlashCommand(command: EditorSlashCommand): () => void;
}

/** Per-plugin JSON settings blob (one document). Requires `storage`. */
export interface SettingsApi {
  get<T = unknown>(): Promise<T | null>;
  set(value: unknown): Promise<void>;
}

/** The curated event names. */
export type DocGraphEvent =
  | "file:opened"
  | "file:wrote"
  | "link:external"
  | "index:ready"
  | "index:updated";

export interface EventsApi {
  /** Subscribe to a curated event. Requires `events`. Returns an unsubscribe
   *  fn. Payload is a path string for file/link events, `undefined` for
   *  index events. */
  on(event: DocGraphEvent, cb: (payload: unknown) => void): () => void;
}

/** Namespaced key/value store (JSON values). Requires `storage` + open vault. */
export interface StorageApi {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** One retrieved chunk from `ai.retrieve` (with source path + breadcrumb). */
export interface AiChunk {
  filePath: string;
  breadcrumb: string;
  content: string;
  score: number;
}

/** Options for `ai.retrieve`. */
export interface AiRetrieveOptions {
  activeFile?: string;
  maxChunks?: number;
}

/** Options for `ai.complete`. */
export interface AiCompleteOptions {
  system?: string;
}

/**
 * Local-AI access (ADR 0031). **Requires the `ai` permission.** `retrieve` is
 * read-only RAG search (fully local, no model call); `complete` is one
 * non-streaming generation over the user's local model (no agent loop, no
 * tools, no file writes — declare `vault:write` if you need to write).
 */
export interface AiApi {
  retrieve(query: string, opts?: AiRetrieveOptions): Promise<AiChunk[]>;
  complete(prompt: string, opts?: AiCompleteOptions): Promise<string>;
}

/** The `app` object the host injects into `onload`. */
export interface DocGraphApp {
  readonly id: string;
  vault: VaultApi;
  workspace: WorkspaceApi;
  ui: UiApi;
  commands: CommandsApi;
  editor: EditorApi;
  settings: SettingsApi;
  events: EventsApi;
  storage: StorageApi;
  /** Local-AI access (retrieve + complete). Requires the `ai` permission. */
  ai: AiApi;
  /** v1: external network is not supported — rejects with a clear error. */
  http: { fetch(): Promise<never> };
}

/** Permission strings (closed set). Declare what you use in manifest.json. */
export type Permission =
  | "vault:read"
  | "vault:write"
  | "ui:panel"
  | "ui:modal"
  | "ui:ribbon"
  | "ui:command"
  | "ui:settings"
  | "storage"
  | "events"
  | "http:fetch"
  | "ai";

/** The manifest.json shape (ADR 0003 / 0020). `id` MUST equal the directory
 *  name and match `^[a-z0-9][a-z0-9._-]*$`. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  permissions: Permission[];
  minAppVersion?: string;
  author?: string;
  repo?: string;
}
