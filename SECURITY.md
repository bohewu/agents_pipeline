# Security Policy

## Reporting

Please report suspected vulnerabilities privately.

- Preferred: GitHub private vulnerability reporting for this repository.
  URL: `https://github.com/bohewu/agents_pipeline/security/advisories/new`
- Fallback: contact the maintainer privately on GitHub and include the affected files, impact, and reproduction details.

Do not open a public issue for an unpatched vulnerability.

## What Counts As A Security Issue

Examples include:

- token, credential, or secret exposure
- insecure handling of local auth files or provider reports
- supply-chain verification bypasses in installers or remote content flows
- unsafe remote fetch/install behavior that can execute or trust unexpected content
- path traversal, arbitrary file overwrite, or unsafe cleanup behavior in scripts/plugins/tools
- privacy leaks caused by unexpectedly printing account metadata or sensitive identifiers

If you are unsure whether something is security-relevant, report it privately anyway.

## Supply-Chain And Credential Notes

- Never commit live tokens, auth JSON, premium-usage reports, or copied provider payloads.
- Prefer pinned release assets and checksums over mutable `main` bootstrap flows.
- For remote skill installs, prefer `--ref=<tag|sha>` when possible.
- Treat `--include-sensitive` output from `provider-usage` as restricted data.
- Keep error messages helpful, but do not print full tokens, cookies, refresh payloads, or raw credential blobs.

## Expected Response

- Initial acknowledgement target: within 3 business days.
- Triage/update target: weekly until the issue is resolved or ruled out.
- If a fix is needed, the goal is to ship the smallest safe patch first, then follow up with broader hardening if necessary.

## Public Disclosure

Please wait for a maintainer confirmation before public disclosure.
Once fixed, we can coordinate a changelog/security note as appropriate.
