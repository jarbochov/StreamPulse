# Technical reference

This section is for people setting up connections, running StreamPulse outside the desktop app, building automations, troubleshooting deployments, or contributing code.

If you are looking for what StreamPulse can do for your show, start with [features](features.md). For everyday use, follow the [streamer guide](streamer-guide.md). The [quick start](quickstart.md) covers the desktop app and your first OBS connection without a development setup.

## Setup and hosting

| Guide | Use it for |
| --- | --- |
| [Desktop app](desktop-app.md) | Desktop operation, data locations, tray behavior, lifecycle, and packaging details. |
| [Developer setup](developer-guide.md) | Installing from source, choosing a dependency profile, and running the Node.js server or desktop development build. |
| [Server management & backups](server-management.md) | Command-line operation, restart behavior, backup contents, restore requirements, and operational limitations. |
| [Troubleshooting](troubleshooting.md) | Diagnosing connection, browser-source, audio, and other setup problems. |

**Running without the desktop app?** Start with the developer setup guide, then read server management for ongoing operation. The quick start's OBS instructions assume StreamPulse and OBS run on the same computer; a different host or port needs the corresponding reachable address.

## Integrations and stream connections

| Guide | Use it for |
| --- | --- |
| [SocialStream Ninja setup](socialstream-setup.md) | Chat capture, local connection settings, and verifying event flow. |
| [Companion & Stream Deck](companion.md) | Connecting the separate Companion module, setting up buttons, feedback, and variables. |
| [Clips (Beta)](clips-beta.md) | Clip detection, review workflows, Twitch permissions, and clipping limitations. |
| [Overlay URL Wizards](overlay-wizards.md) | Browser-source links, display settings, dimensions, and overlay-specific options. |

Twitch account connection is introduced in the [quick start](quickstart.md). The [API reference](api-reference.md) contains the deeper authentication and integration details. Integrations depend on the accounts, permissions, and services you enable; they do not all work from chat capture alone.

## API and automation

The [HTTP API & WebSocket reference](api-reference.md) documents endpoints, live messages, and request formats for custom controllers and automation.

For product-specific context, also see the [Chat Bot guide](chatbot-guide.md), [Alerts guide](alerts-guide.md), and [Companion guide](companion.md). These explain the controls and settings around the integrations.

## Development and contribution

Use the [Developer & Contributor Guide](developer-guide.md) for prerequisites, development commands, tests, code standards, and documentation workflow.

The [GitHub repository](https://github.com/jarbochov/StreamPulse) contains the source, [issue tracker](https://github.com/jarbochov/StreamPulse/issues), and [release downloads](https://github.com/jarbochov/StreamPulse/releases/latest). Check the [changelog](changelog.md) for behavior changes between releases.

## Architecture and internals

Read [Architecture & Routing](architecture.md) for the server structure, services, routing, live updates, and persistence model. The [Desktop app guide](desktop-app.md) explains how those pieces run inside the desktop application.

Operational detail about backups and restores belongs in [Server management](server-management.md), including what a backup includes and the limitations to account for when restoring data.

## Detailed studio references

Existing studio guides remain available at their original addresses. They combine usage instructions with advanced options and implementation details:

- [Custom Overlay Studio](custom-overlays.md)
- [Credits Studio](credits-guide.md)
- [Choice Randomizer](randomizer-guide.md)
- [Live Polls & Poll Manager](polls-guide.md)
- [Game Plan](game-plan-guide.md)
- [Community Directory](community-guide.md)
- [Alerts & Alert Queue](alerts-guide.md)
- [Chat Bot](chatbot-guide.md)

For a plain-language overview before choosing a guide, return to [features for your stream](features.md).
