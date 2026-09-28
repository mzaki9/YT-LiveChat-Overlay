# Performance & Memory Findings — YouTube Live Chat Overlay

**Date:** 2026-09-28
**Commit measured:** `dd6bba0` (feat(overlay): replay parity with live chat layout)
**Scope:** find bloat to trim so replay behaves like livestream without carrying dead weight.

---

## 1. Method / environment

- Headless **Chrome 154** (`--headless=new`, `--remote-debugging-port`, `--enable-precise-memory-info`).
- The extension could **not** be loaded with `--load-extension` (branded Chrome ≥137 blocks it), so the
  content scripts (`utils → performance → ui → overlay → content`) + `css/styles.css` were injected into the
  page via CDP `Page.addScriptToEvaluateOnNewDocument` — same code, same order, main world instead of an
  isolated world.
- **Fullscreen emulated** by patching the Fullscreen API before YouTube boots (headless refuses
  `requestFullscreen`: *"Permissions check failed"*), then clicking YouTube's own fullscreen button so YouTube
  performs its real DOM move (`#player-container` → `#player-full-bleed-container`).
- **User-Agent spoofed** to a normal Chrome UA. Without it YouTube's chat document renders
  *"It looks like you're using an older version of your browser"* and never mounts `yt-live-chat-app`,
  which silently breaks every measurement (and makes the extension's `isArchiveChatPlayable()` fail).
- Test pages: replay `UcYhlqKlCXI`, live `U4J8GHVEQQA`.
- Metrics: CDP `Performance.getMetrics` deltas over fixed windows, `performance.memory`, CDP CPU profiles
  (self-time aggregation), plus function-level timers via wrapper instrumentation.

**Caveats:** headless has no real GPU, so `backdrop-filter`/GPU compositing cost is under-represented; rAF
runs uncapped (~200 fps) so FPS is only a relative signal. Heap, script/task time, layout and recalc counters
are reliable.

---

## 2. Structural findings (needed context)

| Fact | Detail |
|---|---|
| Overlay only exists in fullscreen | `content.js` gates all injection on `isYouTubeFullscreen()` |
| In fullscreen, chat moves | YouTube relocates `ytd-live-chat-frame` into `#panels-full-bleed-container`, which is a sibling of `#player-full-bleed-container` inside `#full-bleed-container` |
| New CSS rule | `styles.css:515` hides `#panels-full-bleed-container` in fullscreen → hides the **native chat panel**, never the video |
| Replay path | borrows the native `#chatframe` → **one** chat document ✅ |
| Live path | creates its **own** `live_chat` iframe while YouTube's native one keeps running → **two** chat documents ❌ |
| Hiding the sidebar never hid the video | verified for `#panels-full-bleed-container`, YouTube's *Hide chat*, chat-hidden-then-fullscreen, `#secondary`, `#chat-container`, live **and** replay. Only hiding `#columns` (windowed) kills the video, because the player lives inside `#columns > #primary` |

---

## 3. Measurements

### #1 — Duplicate live chat document (biggest bloat)

Live page, fullscreen, overlay visible. A/B: native `#chatframe` document alive vs. blanked, per **8 s**:

| Metric | native chat alive | native chat killed | Δ |
|---|---:|---:|---|
| JS heap | 173.5 MB | 140.8 MB | **−32.7 MB (−19 %)** |
| Script time | 1508 ms | 429 ms | **−71 %** |
| Total task time | 5375 ms | 2492 ms | **−54 %** |
| DOM node mutations | 15573 | 2387 | **−85 %** |
| Layouts / recalcs | 167 / 376 | 111 / 172 | −33 % / −54 % |
| Main-frame profile (program) | 3248 ms | 1570 ms | −52 % |

CPU profile in the "alive" state is dominated by `live_chat_polymer.js` (`h.showNewItems_`, `oc`,
`appendBuffer`, …) — i.e. the *duplicate* chat app doing real work every second.

### #2 — `debugState()` is a no-op whose arguments still execute

`utils.js:34` → `function debugState() {}`. Callers build the argument object eagerly, so hot paths pay for a
log line that prints nothing:

- `content.js:150` (`mode: detectChatMode()` inside `handleFullscreenChange`)
- `content.js:173` (`startAttachRetry`)
- `content.js:250` (`injectLiveChatOverlay:start`)
- `overlay.js:759` (`toggleOverlayChat`)

`handleFullscreenChange` fires ~16×/15 s; each call evaluates at least one `detectChatMode()` for nothing.

### #3 — Mode detection re-scans 1.6 MB of inline `<script>` text

Page: **61 `<script>` tags, 1 593 975 bytes** of inline text. Measured per call:

| Function | ms/call |
|---|---:|
| `detectChatMode()` (worst state: windowed, no chat attached) | **3.084** |
| `detectChatMode()` (fast path: replay iframe attached) | 0.044 |
| `isYouTubeLiveNow()` | 2.068 |
| `hasArchiveReplaySignal()` (full scan for `liveChatReplayContinuation`) | 0.879 |
| `isLiveBroadcast()` | 0.745 |
| `getInlinePlayerResponseLiveState()` (script-text scan) | 0.252 |
| `hasLiveChatSignals()` | 0.261 |
| `getVideoId()` | 0.004 |
| `document.querySelectorAll('*')` *(scale reference)* | 0.065 |
| `document.body.querySelector(...)` *(one observer callback unit)* | 0.150 |

`detectChatMode()` in its worst state is **47× a full-DOM `querySelectorAll('*')`**.

### #4 — Body-wide MutationObserver

`content.js:340` observes `document.body` with `{childList: true, subtree: true}`.

Callback fires over 15 s: **63 (baseline) → 322 (with extension)** ≈ 17 extra fires/s, each running
`node.querySelector(...)` across every added subtree.

CPU is largely absorbed by the 250 ms debounce (windowed overhead only +26 ms script / 15 s), so this is a
traffic/GC issue rather than a CPU fire.

### #5 — Extension idle cost is otherwise small

Fullscreen, overlay open, 15 s window — total time inside extension functions:

| Function | calls | ms |
|---|---:|---:|
| `startInjection` | 16 | 3.9 |
| `handleFullscreenChange` | 16 | 2.3 |
| `detectChatMode` | 32 | 1.4 |
| `getVideoId` | 48 | 0.7 |
| `getLiveChatIframe` | 32 | 0.0 |
| `ensureOverlayConnected` | 16 | 0.1 |
| `setupPlayerFullscreenObserver` | 16 | 0.2 |

≈ **9 ms / 15 s ≈ 0.06 % CPU**. The 1 s `lifecycleInterval` is not the problem.

### #6 — Windowed baseline vs extension (chat closed, both idle, per 15 s)

| Metric | baseline | with extension | Δ |
|---|---:|---:|---|
| Script time | 179 ms | 205 ms | +26 ms (~0.17 % CPU) |
| Layouts | 0 | 58 | +58 |
| Recalcs | 102 | 439 | +337 |
| Heap | 94.1 MB | 99.6 MB | +5.5 MB |
| Observer callback fires | 63 | 322 | +259 |
| DOM nodes added by extension | — | — | **+40** |

### #7 — Overlay visible vs hidden (fullscreen, native chat already killed, per 8 s)

| | layouts | recalcs | script |
|---|---:|---:|---:|
| overlay shown | 166 | 241 | 520 ms |
| overlay hidden | **0** | 72 | 460 ms |

The visible overlay (i.e. the chat messages rendering inside the borrowed iframe) is essentially the **only**
source of layout work. Inherent to showing chat.

### #8 — `backdrop-filter` blur is NOT a problem

Alternating A/B, 3 × 2 windows of 8 s, live chat streaming:

| | fps | layouts | recalcs | recalc ms |
|---|---:|---:|---:|---:|
| blur **ON** (`blur(8px)` + box-shadow) | 188.6 | 80.7 | 262.7 | 40.3 |
| blur **OFF** | 186.4 | 84.7 | 206.0 | 31.0 |

Within noise → **keep the blur and its slider**. (GPU-side cost not measurable headless.)

---

## 4. Dead code (grep: definition only, never referenced)

- `measureUpdatePerformance`, `adaptUpdateInterval`, `getAdaptiveInterval` — the whole "adaptive interval"
  machinery; nothing reads `getAdaptiveInterval()`.
- `isYouTubeLiveVideo`
- `hasLiveChatSignals`
- `getColorFromName`
- `__ytOverlayPerf` stats surface (`getMemoryStats`, `getPerformanceStats`, `resetPerformanceMetrics`) —
  console-only telemetry, no internal consumer.

---

## 5. Bundle / DOM footprint

| File | Bytes | Lines |
|---|---:|---:|
| `overlay.js` | 29 773 | 703 |
| `utils.js` | 20 355 | 471 |
| `content.js` | 13 896 | 366 |
| `ui.js` | 6 005 | 176 |
| `performance.js` | 4 466 | 148 |
| `css/styles.css` | 10 499 | 519 |
| **JS total** | **74 495** | 1 864 |

DOM added by the extension itself: **+40 nodes** (the +19 000 node figure seen in metric deltas is the chat
document, which is inherent to displaying chat).

---

## 6. Trim list (priority order)

| # | Action | Expected saving | Status |
|---|---|---|---|
| 1 | **Reuse the native live-chat iframe instead of loading a second one** (borrow, same as the archive path) | **−33 MB heap, −71 % script, −85 % DOM churn** | ✅ done |
| 2 | **Cache static mode-detection signals** per videoId+URL, and make `debugState` lazy (thunks) so hot paths stop evaluating `detectChatMode()` for a no-op | `detectChatMode` 3.08 ms → ~0.2 ms | ✅ done |
| 3 | **Scope the MutationObserver** to `#movie_player`, `ytd-watch-flexy`, `#secondary`, `#chat-container` instead of `document.body`; skip subtree queries when not fullscreen | observer traffic −80 % | ⬜ open |
| 4 | **Delete dead code** (§4) + drop permanent `will-change: transform, left, top` (apply only while dragging/resizing) | ~2 KB + parse time, one retained layer | ⬜ open |
| 5 | Keep blur/shadow (measured as free), keep `performance.js` ring buffers (negligible) | — | ✅ keep |

---

## 7. What was implemented (findings #1 and #2)

### #1 — single live chat document (`utils.js`, `overlay.js`, `content.js`)

Live sources are now `native_borrow` (YouTube's own running chat document, moved into
the overlay) instead of `live_direct` (a second copy), reusing the exact machinery the
archive path already used: `rememberBorrowedIframe()` / `restoreBorrowedIframe()` /
`isBorrowedSourceKind()`.

Two facts shaped the design:

* YouTube **blanks `#chatframe` at the moment of the fullscreen swap** and reloads it
  about a second later — so at `attachChatSource()` time the native document is
  `about:blank`.
* YouTube **only loads chat while the frame sits in `ytd-live-chat-frame`**. Verified:
  borrowing the blank frame leaves it blank forever (overlay showed 0 messages, no
  second document was ever created). A blank native frame can therefore never be
  adopted up-front.

Hence: *managed first, upgrade when native is ready*.

```js
resolveLiveChatSource():
  borrowable = findNativeLiveChatIframe(currentIframe)   // running native doc?
  → { kind: 'native_borrow', iframe }   else   → { kind: 'live_direct', url }

shouldUpgradeToNativeChat():          // overlay.js
  isOverlayVisible && activeChatSourceKind === 'live_direct'
  && findNativeLiveChatIframe(activeChatIframe)

content.js lifecycleInterval (1 Hz, fullscreen only):
  if (chatIframeContainer && shouldUpgradeToNativeChat()) attachChatSource(...)
```

`findNativeLiveChatIframe()` prefers the frame already being served, so the overlay
never churns between candidates.

### #2 — cached mode detection + lazy logging (`utils.js`)

* `getCachedSignal(name, compute)` — 1 s TTL, keyed by `videoId + location.href`
  (SPA navigations invalidate the key). Wraps `getInlinePlayerResponseLiveState()`
  (full script-text scan), the new `hasReplayContinuationSignal()`, `isLiveBroadcast()`
  and the static verdict inside `hasArchiveReplaySignal()`. The dynamic iframe check in
  `hasArchiveReplaySignal()` stays uncached, so opening/closing chat is still detected
  immediately.
* `debugState(message, data)` now logs only when `debugLoggingEnabled` is set **and**
  accepts `() => data` thunks; the five expensive call sites
  (`content.js` ×3, `overlay.js` ×2) pass thunks, so a disabled logger costs nothing.

---

## 8. Re-verification (measured after the change)

Same harness, same pages, same windows.

### Live + fullscreen + overlay — 8 s window

| Metric | before (2 docs) | after (1 doc) | Δ |
|---|---:|---:|---|
| Script time | 1508 ms | **395 ms** | **−74 %** |
| Total task time | 5375 ms | **1382 ms** | **−74 %** |
| Layouts | 167 | 122 | −27 % |
| Recalcs | 376 | 191 | −49 % |
| Chat documents | 2 | **1** | — |

Chat messages keep rendering in the overlay (`msgs` 63 → 150 over 14 s), `kind` settles
on `native_borrow`, and the only other iframe left on the page is `about:blank`.

### Mode detection (replay, chat closed, per call)

| Function | before | after | Δ |
|---|---:|---:|---|
| `detectChatMode()` warm | 3.084 ms | **0.181 ms** | **−94 %** |
| `detectChatMode()` cold (cache fill) | — | 4.5 ms | paid ≤1×/s |
| `isYouTubeLiveNow()` | 2.068 ms | **0.011 ms** | −99 % |
| `hasArchiveReplaySignal()` | 0.879 ms | **0.008 ms** | −99 % |
| `isLiveBroadcast()` | 0.745 ms | **0.002 ms** | −99 % |

Verdicts unchanged: `detectChatMode()` still returns `'archive'` on the replay page and
`'live'` on the live page.

### Functional matrix (all passed)

| Scenario | Result |
|---|---|
| Live: enter fullscreen | managed → upgraded to `native_borrow` ≤1 s, 1 document |
| Live: exit fullscreen | iframe restored to `ytd-live-chat-frame` (`frameInHost: true`), overlay removed, chat doc alive with `ov: false` |
| Live: re-enter | re-borrowed, 1 document |
| Live: toggle overlay off (in fullscreen) | restored to host, `kind: null`, 1 document |
| Live: toggle overlay on | re-borrowed |
| Live with native chat **hidden by the user** | `live_direct` (managed), and YouTube never spawns a native doc — still 1 document after 15 s |
| Replay: enter / exit / re-enter | `archive_borrow` → restored → re-borrowed, 1 document throughout |
| `npm run lint` / `npm run build` | 0 errors, 0 warnings / zip built |

### Still open (not measured after change)

* Finding #3 — body-wide MutationObserver (63 → 322 callback fires / 15 s).
* Finding #4 — dead code (`measureUpdatePerformance`, `adaptUpdateInterval`,
  `getAdaptiveInterval`, `isYouTubeLiveVideo`, `hasLiveChatSignals`, `getColorFromName`)
  and permanent `will-change: transform, left, top`.
