# Silent Actions for Valenced

Silent Edit and Silent Delete for your own Discord messages.

## Installation

Add this repository in Valenced → Plugins → Repositories:

```text
https://mihile.github.io/valenced-silent-actions/
```

Long-press a message and check **Silent Actions** to enable or disable it. When enabled, use Discord’s normal edit and delete actions. The setting is on by default and persists across restarts.

<details>
<summary>Details and limitations</summary>

This is an experimental, untested plugin. It sends a new message with the original message ID as its nonce and deletes the original. Silent Delete also deletes the placeholder. This relies on Discord client behavior and may stop working or fail to hide messages from loggers. Other clients, bots, notifications, and server logs may still see the messages. Deletion is permanent. Check the channel after an error before retrying.

Silent edits support text-only messages without replies or attachments. Unsupported edits are blocked while enabled; disable Silent Actions to edit them normally. Replacements have a new ID and may move after reload. Mentions and notifications are suppressed. Client modifications can violate Discord's terms.

Inspired by [SilentEdit](https://github.com/aurickk/SilentEdit-Vencord) and [SilentDelete](https://github.com/aurickk/SilentDelete-Vencord).

</details>
