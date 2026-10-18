# @docgraph/plugin-api

Type definitions for authoring [DocGraph](https://github.com/docgraph-app)
plugins. **Types only** — the runtime `app` object is built by the host and
handed to your `onload(app)`; you never import or construct it.

> **v1.0 — the surface below is frozen.** See [Stability](#stability) before you
> publish. A plugin written against v1 keeps working across DocGraph updates.

A plugin is an ESM module whose default export implements `DocGraphPlugin`, plus
a `manifest.json`. Both live in a folder under `~/.docgraph/plugins/<id>/`. The
whole thing is "~100 lines of TypeScript" — no DocGraph build toolchain required.

```
~/.docgraph/plugins/word-count/
  manifest.json
  main.js          # your compiled ESM module
  styles.css       # optional, injected globally on load
```

## Hello world

```ts
import type { DocGraphPlugin } from "@docgraph/plugin-api";

export default {
  async onload(app) {
    // Read a file (needs "vault:read")
    const files = await app.vault.list();

    // A sidebar panel that styles against host theme tokens and reacts to
    // light/dark for free (needs "ui:panel")
    app.ui.registerPanel({
      id: "summary",
      title: "Summary",
      icon: "file-text",
      mount(el) {
        el.innerHTML = `
          <div style="padding:16px;color:var(--foreground);
                      background:var(--background);font:13px system-ui">
            ${files.length} files in this vault
          </div>`;
      },
    });

    // Persist something (needs "storage" + an open vault)
    await app.storage.set("lastOpened", Date.now());
  },

  onunload() {
    // Clear YOUR OWN timers / async here — see "Teardown" below.
  },
} satisfies DocGraphPlugin;
```

## manifest.json

```jsonc
{
  "id": "word-count",          // MUST equal the folder name; ^[a-z0-9][a-z0-9._-]*$
  "name": "Word Count",
  "version": "0.1.0",
  "main": "main.js",           // MUST be exactly "main.js" — the entry filename is fixed
  "permissions": ["vault:read", "ui:panel", "storage", "events"],
  "minAppVersion": "0.1.0",    // optional
  "author": "You",             // optional
  "repo": "you/word-count"     // optional
}
```

`main` is required but **not configurable** — it must be the literal string
`"main.js"`, and your bundle must be at `<plugin dir>/main.js`. DocGraph imports
that filename directly (`plugin://localhost/<id>/main.js`), so a manifest naming
anything else is rejected at load time. Bundle into `main.js` at the plugin
root; a `dist/` layout won't load.

## Permissions (advisory but checked)

Declare every permission you use. The SDK **refuses** a call into a domain you
didn't declare and logs a `console.warn` telling you which permission to add —
so a missing permission fails loudly in dev, not silently. A determined plugin
on the main thread *can* bypass the SDK; the model is honest about that (a
stricter sandbox is a future tier). The closed set:

| Permission | Unlocks |
|---|---|
| `vault:read` | `vault.list`, `vault.read` |
| `vault:write` | `vault.write` |
| `ui:panel` | `ui.registerPanel` |
| `ui:ribbon` | `ui.addRibbonIcon` |
| `ui:command` | `commands.register` |
| `ui:modal` | `ui.openModal` |
| `ui:settings` | `ui.registerSettingsTab` |
| `storage` | `storage.*`, `settings.*` |
| `events` | `events.on`, `vault.watch` |
| `ai` | `ai.retrieve`, `ai.complete` — local-model access (see below) |
| `http:fetch` | reserved — **not supported in v1** (see below) |

`app.workspace` and `app.ui.theme` are ungated (benign navigation / read-only).

## Events (`app.events.on`)

A curated, renamed subset of DocGraph's internal events. You get exactly these
five — never raw event names — so the host can guarantee teardown and rename
internals freely. Requires `events`.

| SDK event | Fires when | Payload |
|---|---|---|
| `file:opened` | a file becomes active (incl. in-page link clicks) | path `string` |
| `file:wrote` | a file is written | path `string` |
| `link:external` | the user follows an external link | url `string` |
| `index:ready` | the vault index finishes (re)building | `undefined` |
| `index:updated` | the index changes after a file edit | `undefined` |

`app.vault.watch(cb)` is a convenience over `index:ready` + `index:updated`.

## Theming — the CSS-token contract

Your panel owns a raw DOM subtree, but should look native in light **and** dark
without bundling Tailwind. **Style against the host's CSS custom properties**
(below) instead of hard-coding colors — they re-resolve when the user toggles
theme, so your UI follows along for free. These names are **frozen** as part of
the v1 surface; we will not rename them.

```
--background          --foreground
--card                --card-foreground
--popover             --popover-foreground
--primary             --primary-foreground
--secondary           --secondary-foreground
--muted               --muted-foreground
--accent              --accent-foreground
--destructive         --border          --input          --ring
```

Read them in JS via `app.ui.theme`:

```ts
app.ui.theme.current();                 // "light" | "dark"
const off = app.ui.theme.onChange((m) => repaint(m));
app.ui.theme.tokens;                    // the frozen names above
```

Use `var(--foreground)` etc. in CSS for the common case; reach for
`app.ui.theme` only when you need the *value* in JavaScript (e.g. drawing to a
`<canvas>`).

### Plugin CSS is global

An optional `styles.css` is injected verbatim into a `<style>` tag (removed on
disable). It is **not** scoped — it shares the global cascade. Namespace your
selectors by your plugin id (e.g. `.word-count-row`, not `.row`) so you don't
collide with the app or other plugins. True isolation (shadow DOM) is a future
tier.

## Icons

`icon` fields take a **string key**, not a component, so manifests stay
serializable. v1's frozen key set:

```
alert-triangle  book-open  calendar  check  file-text  hash  heart  link
list  network  pencil  puzzle  search  settings  sparkles  star  tag  zap
```

Unknown or omitted keys fall back to a generic puzzle icon.

## Teardown — clear your own timers & async

The host tracks everything that flows through the SDK — panels, commands,
ribbon icons, event listeners, settings tabs, modals — and tears it all down
when your plugin is disabled, **even if your `onunload` forgets**.

What the host **cannot** see is your own `setInterval` / `setTimeout` and
in-flight promises. Clearing those is **your responsibility** in `onunload()`:

```ts
let timer;
export default {
  onload(app) { timer = setInterval(() => { /* ... */ }, 1000); },
  onunload() { clearInterval(timer); },   // ← required; an uncleared interval
                                          //   survives disable
} satisfies DocGraphPlugin;
```

An uncleared interval is the most common real-world leak — it keeps running
after your plugin is gone.

## Storage & settings

- `app.storage` is a namespaced key/value store (JSON values), backed by the
  open vault's database. Per-plugin, so you never collide. There's a per-value
  size cap (256 KB) to keep the shared database lean. Requires an **open
  vault**.
- `app.settings` is a single JSON document (`get()` / `set(value)`) — handy for
  a settings tab. Same backing store and cap.

## AI (`app.ai`) — needs the `ai` permission

Local-model access, two methods. The `ai` permission is the one that lets a
plugin reach the model, so it carries the loudest install consent — declare it
only if you use it.

```ts
// Read-only semantic search over the vault. Fully local — no model call.
const hits = await app.ai.retrieve("retry/backoff policy", { maxChunks: 5 });
//    → [{ filePath, breadcrumb, content, score }, …]

// One non-streaming completion from the user's configured local model.
const out = await app.ai.complete("Summarize:\n\n" + hits[0].content, {
  system: "Reply in one sentence.",
});
```

`complete` is a single pass — **no agent loop, no tools, no file writes.** If
your plugin needs to edit existing notes, declare `vault:write` and use `app.vault.write`
visibly; don't route writes through the model. `complete` rejects with a
human-readable message when AI is disabled in Settings, no model is configured,
or Ollama is unreachable.

## Panels: tab badges & opening files

`registerPanel` returns a handle for the rail tab's count badge:

```ts
const panel = app.ui.registerPanel({ id: "problems", title: "Problems", … });
panel.setBadge(brokenLinks.length, "warning");   // amber count; null clears it
```

Read vault-wide diagnostics and jump to a location:

```ts
const broken = await app.vault.brokenLinks();     // needs vault:read
app.workspace.openFile(broken[0].fromPath, {
  scrollToByteOffset: broken[0].sourceByteOffset, // scroll to the bad <a>
});

const graph = await app.vault.linkGraph();        // {nodes, edges}; needs vault:read
app.ui.setPanelExpanded(true);                    // maximize the sidebar; needs ui:panel
```

## Not in v1

- `app.http.fetch()` **rejects** with a clear error. External network for
  plugins is deferred; the manifest `http:fetch` permission is reserved but
  inert. (App-mediated network, like the plugin store, is separate.)
- Plugins don't hot-reload — disable + enable (or restart) to pick up changes.

## Stability

**As of `@docgraph/plugin-api@1.0.0` the surface is frozen.** A plugin written
against v1 keeps working across DocGraph updates. The guarantee, and its limits:

**Frozen — will not change without a major (v2) bump:**

- The `app` object shape: `vault`, `workspace`, `ui`, `commands`, `settings`,
  `events`, `storage`, `ai`, `http`, `id`, and every method's name + signature
  listed above.
- The **permission strings** (`vault:read` … `http:fetch`, `ai`).
- The **curated event names** (`file:opened`, `file:wrote`, `link:external`,
  `index:ready`, `index:updated`) and their payload shape.
- The **CSS design tokens** (`--background`, `--foreground`, `--primary`, …) —
  see [Theming](#theming--the-css-token-contract).
- The **icon keys** — see [Icons](#icons).
- The `manifest.json` shape.

**Still allowed (backward-compatible, no major bump):**

- Adding new methods, new events, new icon keys, new optional fields, or new
  optional method arguments. Your plugin ignores what it doesn't use.
- Bug fixes and performance work behind the same signatures.

**Explicitly *not* covered by the freeze** (don't depend on these):

- Anything reached by going *around* the SDK — raw `window.__TAURI__`/`invoke`,
  internal Tauri event names, core DOM structure / class names, undocumented
  globals. The permission model is advisory, so this is technically reachable on
  the main thread — but it is unsupported and may break at any time.
- The v1.x sandbox tier and `http:fetch` (see [Not in v1](#not-in-v1)) — when
  they land they'll be *additions*, not breaks.

If you stick to the documented `app` surface, the tokens, and the events, your
plugin is safe across the whole v1 line.
