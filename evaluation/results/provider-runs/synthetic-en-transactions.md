# Real-provider smoke

Status: **FAIL**

- Provider: `gemini-openai-compatible`
- Model: `gemini-3.5-flash`
- Credential value logged: `False`
- Samples executed: `1`
- Model check: `PASS`
- Available model count: `51`

| Sample | Language | Status | Events | Failed chunks | Relations | Context | Supported Ask | Unsupported abstention | Citations | Latency ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| synthetic-en-transactions | en | FAILED | None | None | None | NOT_COMPLETED | NOT_COMPLETED | None | None | None |

## Failure metadata

- Sample: `synthetic-en-transactions`
- Failure class: `RATE_LIMIT`
- Failed stage: `ask_supported:en-supported-atomicity`
- Provider calls in failed stage: `3`
- Rate limits in failed stage: `3`
- Retry waits (seconds): `[5.555, 15.26]`

This artifact records non-sensitive execution metadata only. It is not a substitute for human-reviewed quality metrics.
