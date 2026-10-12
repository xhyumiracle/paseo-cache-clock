# Cache clock for Paseo

A live prompt-cache timer plugin for Claude agents in [Paseo](https://paseo.sh).

![The cache clock above the Paseo composer](assets/composer.png)

## Install

Enable plugins in Paseo settings, then run:

```bash
paseo plugin add git:xhyumiracle/paseo-cache-clock
```

Or hand it to your agent:

```text
Install the Paseo plugin at github.com/xhyumiracle/paseo-cache-clock
```

## What it shows

It mirrors the prompt cache clock in Claude Code's VS Code extension.

| Pill | Meaning |
| --- | --- |
| Clock `54m` | Warm. Minutes left before it expires. |
| Red clock `cold` | Expired, compacted, or the model changed. |

Hover for details. Claude agents only.

## How it stays accurate

- **Cache lifetime**: read from the transcript. Claude Code records 5 min or 1 h per request.
- **Start time**: the message the last request was built on. It is logged before the request is sent, so the timer may end early, never late.
- **Forked or resumed sessions**: it follows the conversation's parent links, like Claude Code does.

## Privacy and cost

- Read-only. Sends nothing anywhere.
- Reads the transcript tail on load and when a turn ends. Idle agents cost nothing.

## Limits

- Early eviction by the provider is invisible.
- Thinking-level changes are not tracked.

## Develop

```bash
npm install && npm test
```

MIT
