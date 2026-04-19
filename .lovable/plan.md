

User wants the full accountability + AI review system. Key constraints:
- Screenshots are mandatory (browser-based, with consent)
- Time tracking + attendance
- LLM can be self-hosted (Mac Studio or cloud GPU) — not limited to Lovable AI

Reality check on screenshots: A web app **cannot** capture the desktop. Browser `getDisplayMedia()` can capture a screen/window/tab but requires the user to click "Share" every time the browser starts a capture session — there is no silent background capture in a pure web app. The honest options:

1. **Web-only**: webcam snapshots (silent after one consent) + screen-share recording during clock-in (user picks once per session, then we sample frames every N minutes). Acceptable for proof-of-work but not Hubstaff-grade.
2. **Companion desktop app** (Electron or native): true silent screenshot capture every N minutes, app/window tracking, idle detection. This is the Hubstaff-equivalent. Lovable can build the Electron app in a separate project — same auth, same DB.

I'll propose **both** in phases: ship web + webcam now, add Electron tracker after. For AI: route everything through one server function with a `provider` switch — Lovable AI by default, with `EXTERNAL_VISION_URL` env var to point at the Mac Studio (Ollama with `llava`/`qwen2-vl`) or any OpenAI-compatible endpoint (vLLM, LM Studio, Replicate). User decides per-deployment, no code change.

Plan structure: Phase 1 (time + attendance + webcam), Phase 2 (AI review with pluggable backend), Phase 3 (Electron tracker). Keep concise.

---

# Plan — Accountability + AI Video Review

## Phase 1 — Time, Attendance, Webcam Proof (web app, ship first)

**New tables**
- `study_sessions` — `user_id, started_at, ended_at, active_seconds, idle_seconds, blur_count, course_id?, lesson_id?`
- `attendance_snapshots` — `session_id, user_id, kind ('webcam'|'screen'), storage_path, captured_at`
- `attendance_days` — derived view: total focused minutes per user per day

**New storage bucket**: `attendance` (private, RLS: user can insert own, incharge can read franchise, CEO reads all).

**Behavior**
- "Clock in" button on member dashboard → creates `study_sessions` row + asks once for webcam permission (and optional screen-share).
- Heartbeat every 30s while tab is visible: increments `active_seconds`, tracks `document.visibilityState`, mouse/keyboard idle (>2 min idle → `idle_seconds`).
- Webcam snapshot every 5 min (silent after consent) → uploaded to `attendance` bucket.
- Optional screen-share: if user shared a screen at clock-in, capture a frame every 5 min from the same MediaStream (no re-prompt).
- Auto clock-out after 10 min of inactivity or browser close (beforeunload + server-side stale-session cleanup).

**New routes**
- `/member/focus` — clock in/out, live timer, today's focused minutes
- `/incharge/attendance` — franchise members, hours per day, snapshot gallery, idle %
- `/ceo/attendance` — all franchises rollup

## Phase 2 — AI Video Review (pluggable backend)

**New table**
- `ai_reviews` — `submission_id, model, score, rubric_json, comments, frames_analyzed, created_at`

**New server function**: `reviewSubmission(submissionId)`
- Downloads submission video from `submissions` bucket
- Extracts ~6 keyframes + transcript (Whisper via Lovable AI or local)
- Sends frames+transcript+rubric to a vision model via a single `callVisionLLM()` helper

**`callVisionLLM()` provider switch (env-driven, no code change to swap)**

| `VISION_PROVIDER` | Endpoint | Notes |
|---|---|---|
| `lovable` (default) | Lovable AI Gateway, `google/gemini-2.5-pro` | No setup, ships day one |
| `openai_compat` | `EXTERNAL_VISION_URL` + `EXTERNAL_VISION_KEY` | Works with **Ollama on your Mac Studio** (`http://your-mac:11434/v1`), vLLM, LM Studio, Together, Replicate proxy, Groq, OpenRouter |
| `replicate` | Replicate API token | For LLaVA/Qwen2-VL hosted |

You set `VISION_PROVIDER=openai_compat` + `EXTERNAL_VISION_URL=https://your-mac-studio.tailscale.net/v1` + `EXTERNAL_VISION_MODEL=qwen2-vl:7b` and it routes there. To expose your Mac Studio safely: Tailscale Funnel or Cloudflare Tunnel (no port-forwarding, free).

**Rubric** — per pillar (12 of them), stored as JSON in `courses.ai_rubric`. Default rubric = your "Benchmark" paragraphs from the doc, scored 0–10 across: technical correctness, pacing, captions, audio, export, brief alignment.

**UI**
- Member submission: shows AI review under the human review (so AI is advisory, incharge still grades final)
- Incharge: "AI suggested 78/100" pre-fills the grade field with one-click accept

## Phase 3 — Hubstaff-equivalent Desktop Tracker (separate Lovable project, optional)

When you're ready: I scaffold an **Electron app** in a sibling project that:
- Logs in with the same Supabase auth
- Captures silent desktop screenshots every 5 min → uploads to `attendance` bucket
- Tracks active app/window title, idle time, keystroke counts (numbers only, not content)
- Same `study_sessions` table → numbers show up in your existing CEO/incharge dashboards automatically

Packaged as `.dmg` / `.exe` / `.AppImage`. Member installs once, signs in once.

## Decisions I need from you

1. **Phase 1 webcam consent UX** — once at clock-in (recommended) or every session?
2. **Default AI provider for now** — start on Lovable AI (works today, costs credits) and you swap to Mac Studio later, or wait until your Mac Studio endpoint is reachable and start there?
3. **Build Phase 3 desktop tracker now or after Phase 1+2 are validated?**

After you answer those three, I implement Phase 1 + 2 in one go (DB migrations, storage bucket, server functions, pluggable AI helper, member focus page, incharge attendance page, AI review UI, env-var docs for pointing at your Mac Studio).

