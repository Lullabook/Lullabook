# Super.Engineering Run — current-workspace iOS launcher

Issue 204 / local 196. One documented command sequence for the
Super.Engineering **Run** button on a freshly created Lullabook worktree.

## Run command (the whole sequence)

```bash
npm run super:run
```

Equivalent to `node scripts/super-engineering-launcher.mjs`. No personal or
machine-specific path appears anywhere — the launcher resolves the current
workspace from the `SUPERCONDUCTOR_WORKSPACE_PATH` environment variable that
Super.Engineering sets for the current workspace. If you run it by hand instead
of through the Run button, export that variable yourself first:

```bash
export SUPERCONDUCTOR_WORKSPACE_PATH=/absolute/path/to/lullabook
npm run super:run
```

## What it does

1. **Resolve the workspace** — reads `SUPERCONDUCTOR_WORKSPACE_PATH` and
   refuses (non-zero exit, no processes started) if it is missing/empty or
   does not point at a Lullabook checkout (root `package.json` named
   `lullabook` with `mobile/` and `src/`).
2. **Start the backend** — `npm run dev:paid` in the workspace root (Next.js
   on port **3001**, the port consumed by the mobile dev profile).
3. **Wait for readiness** — polls `http://127.0.0.1:3001/` until an HTTP
   response arrives (timeout 120 s; on timeout it stops the backend and exits
   non-zero).
4. **Start the IPv4 Metro proxy** — `mobile/scripts/ipv4-metro-proxy.mjs`,
   so Expo Go can reach Metro (this machine's Metro binds `[::1]` only) via
   `127.0.0.1:8081`.
5. **Launch iOS** — `npm run ios:paid` in `mobile/` (`expo start --ios`), so
   the Simulator opens the latest workspace code.

**Stopping:** `Ctrl-C` (SIGINT) or SIGTERM stops the backend, proxy, and Metro
children and exits with the signal's shell code (130 / 143).

**Credentials:** the launcher adds, echoes, and stores no credentials. The
backend inherits shell env for server config; proxy and Expo children receive
only a safe baseline env. The only mobile credentials in play are the
development-only simulator credentials defined by the mobile dev profile
(`mobile/package.json` → `ios:paid`). No provider key is carried to Expo.

## Fresh worktree prerequisites

1. Create the worktree and install dependencies:
   ```bash
   git worktree add -b my-branch <path>
   cd <path>
   npm install && cd mobile && npm install && cd ..
   ```
2. Prepare local env files from `.env.example` (backend `.env.local`;
   mobile `.env` per `mobile/TESTFLIGHT-RUNBOOK.md` §2). Supabase must be
   reachable for the app to load data.
3. Xcode + Simulator installed (per `mobile/TESTFLIGHT-RUNBOOK.md` and the
   iOS setup notes in `mobile/README.md`).
4. Click **Run** (or run the command above). The Simulator opens the app
   pointed at the backend started by this launcher.
