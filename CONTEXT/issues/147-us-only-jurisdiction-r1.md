# 147 — US-only jurisdiction for R1.0 (Asia = flagged R1.1 fast-follow)

Status: shipped

Multi-jurisdiction engine shipped config-driven, only US enabled for R1.0: consent method,
child-age threshold, data-residency, retention/notice all come from config, no hardcoded US
values. Non-US request rides the same config path (clean "not available" message or US
default), never a crash. Asia slot exists in config, flag-disabled — enabling it later is a
data/config change, no rebuild. Binding: jurisdiction gating stays config-driven, never hardcoded.

(condensed 2026-07-07 — full spec in git history)
