A prompt-cache countdown beside the message box of Claude agents: `cache 42:10`, `cache live` during a turn, `cache cold` after expiry or a model switch, `cache ?` when the transcript cannot settle it.

The daemon reads the tail of the agent's Claude Code transcript. The TTL, 5 minutes or 1 hour, comes from the cache writes recorded for the last request. The countdown starts from the message that request was built on, so it may end slightly early but never late. Read-only; nothing is sent anywhere. Plugins must be enabled on the host.
