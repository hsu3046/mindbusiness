# Security Policy

## API key handling

MindBusiness AI uses a **Bring Your Own Key (BYOK)** model.

- The user's Gemini API key is stored **only in `localStorage`** in the browser.
- It is sent on every API call as the `X-API-Key` HTTP header.
- The backend **never persists** the key — not to disk, not to a database, not to logs.
- The backend `GEMINI_API_KEY` (in `backend/.env`) is an **optional fallback** for shared deployments. If you don't want a fallback, leave it unset.

Because the key lives in `localStorage`, anyone with XSS on the deployed site could exfiltrate it. Operators are responsible for keeping their deployment XSS-free (no untrusted markdown rendering, sanitized inputs, modern CSP headers).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Instead, email **security@knowai.space** with:

- A short description of the issue
- Steps to reproduce (if applicable)
- The version / commit hash where you observed it

We will acknowledge receipt within 7 days and aim to ship a fix within 30 days for high-severity issues.

## Supported versions

This project is in active development. We support security fixes against the **`main` branch** only. There are no LTS branches yet.

## Out of scope

- Self-hosted deployments where the operator added their own modifications
- Issues that require a compromised OS / browser to exploit
- Rate-limit bypass on a self-hosted instance (configurable by operator)
