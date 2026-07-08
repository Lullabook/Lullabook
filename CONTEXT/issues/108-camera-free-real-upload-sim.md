# 108 — Camera-free real-upload path for the Simulator
Status: shipped
Added double-gated dev-only bypasses so a full Adult Persona can be created in the Simulator: library-picker fallback for the consent selfie, a liveness bypass (FakeLiveness, dev-only), and a persona-training dev fallback so personas reach `ready` without live fal keys. Must use free-use/synthetic faces (publicity rights); safety scan still runs; raw photos never rendered (ADR-0020).
All bypasses server-authoritative and inert in production.
Persona-training fallback later hardened/replaced by real training in issue 125.
(condensed 2026-07-07 — full spec in git history)
