# Human gates

Automation stops at the following boundaries. These actions require the repository owner or an authorized operator.

| Gate | Human action | Evidence required |
| --- | --- | --- |
| MCP/Skill installation | Review local files and approve the client configuration | Tools appear under the expected local server; no secret values configured |
| Browser permission | Install/approve the browser runtime or integration and select allowed sites | Permission is limited to intended sites |
| Website access | Log in personally where the user already has lawful access | Page is visibly accessible without exporting credentials or session data |
| Real-site acceptance | Choose representative public and authorized pages and approve testing | Full/partial/blocked results match what the user can see |
| External network change | Approve any domain allowlist or runtime internet setting | Only necessary domains are enabled |
| Release/publish/deploy | Review diff, CI, security implications, and destination | Explicit approval before merge, tag, package publication, or deployment |

The agent must stop and report the blocker instead of requesting credentials, copying cookies/profiles, weakening network controls, bypassing CAPTCHA/paywalls, changing external settings, publishing, or deploying.
