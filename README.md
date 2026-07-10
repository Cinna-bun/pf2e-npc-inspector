# PF2e Creature Inspector

A [Foundry VTT](https://foundryvtt.com/) **v14** module for the **Pathfinder Second Edition (PF2e)** system.

## Installation

In Foundry's **Setup → Add-on Modules → Install Module**, paste this manifest URL:

```
https://github.com/Cinna-bun/pf2e-npc-inspector/releases/latest/download/module.json
```

Enable the module in your world, then configure it under **Configure Settings → PF2e Creature Inspector**.

Hover any creature token (NPC, character, or familiar) for **1 second** and a small popup appears next to the token showing:

- The creature's name (uses the token name, so PF2e mystification is respected)
- Saving throw modifiers (Fortitude, Reflex, Will)
- Immunities
- Weaknesses
- Resistances

The popup closes when you move the cursor off the token, but stays open while your cursor is over the popup itself.

## Settings

Both settings are world-scoped (GM configurable) under **Configure Settings → PF2e Creature Inspector**:

| Setting | Default | Description |
| --- | --- | --- |
| Who can see the popup | Everyone | `Everyone` or `GM only`. When set to GM only, players never get the popup. |
| Hide details from players until revealed | On | When on, players see `???` for each section until the GM reveals it for that creature. |
| Obscure Info | Off | Only applies while the hide setting is on. Instead of `???`, players see each unrevealed saving throw ranked against the creature's other two saves: `Highest`, `Middle`, `Lowest`, `Highest (2)` / `Lowest (2)` for a tied pair above/below the third, or `Equal` when all three match. Immunities, weaknesses, and resistances still show `???`. |
| Granular Info | Off | Only applies while the hide setting is on. The GM can click individual saving throws and individual immunity, weakness, and resistance entries to reveal just those to players. Players see only what's been revealed; a section with nothing revealed still shows `???`. The section eye button still reveals the whole section at once. |

## GM reveal system

When "Hide details from players until revealed" is on, the GM's popup shows an eye button on each section (Saving Throws, Immunities, Weaknesses, Resistances):

- Click a section's eye button to reveal/hide that section for players, **for that creature only**.
- The eye button in the header reveals all four sections at once.
- With **Granular Info** on, each saving throw and each immunity, weakness, and resistance entry in the GM's popup is itself a clickable tag (dashed and dimmed while concealed) that reveals or conceals just that entry for players.
- Reveal state is stored as flags on the actor, so it persists and applies to every token of that actor.
- Player popups that are already open update live when the GM toggles a reveal.