# Skate Robot

The canonical repository instructions are in `AGENTS.md`. Follow that file for
architecture, commands, ownership, verification, deployment, and preview-tool
guidance. Claude-specific overrides: none.

For hosted prototypes, follow **Hosting previews on the Mac mini** in
`AGENTS.md`: the npm commands bind to `100.74.88.58` on the Mac mini (and to
`127.0.0.1` elsewhere, via `scripts/preview-host.mjs`); share a verified
Tailscale URL and leave the delivered server running for review. Do not hand
off a loopback URL. On another machine, set `SKROBOT_PREVIEW_HOST` to its own
Tailscale address to share a preview.
