# Security

OpenDoc runs a local Node service bound to loopback. It has no hosted account system or cloud collaboration service. Keep it local; exposing its port through a proxy or tunnel is outside the supported deployment model.

Document, template, and theme TSX is trusted executable code. Render workers isolate crashes and timeouts, but they are not a security sandbox. Review unfamiliar repositories and TSX before opening or rendering them. An external coding agent has its own permissions and data-sharing behavior.

The app stores documents, source media, feedback, and recovery data locally. `.opendoc/server.json` includes a local session token. Do not publish that file or attach personal work, tokens, or unredacted recovery records to an issue.

For a vulnerability, use the hosting repository's private vulnerability reporting channel when available, or contact a maintainer privately. Include a minimal reproduction using synthetic data and the affected revision. Do not disclose exploitable details or private files in a public issue while coordinating a fix. Ordinary defects can use the issue tracker with the guidance in [CONTRIBUTING.md](CONTRIBUTING.md).
