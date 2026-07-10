import { InspectorPopup, MODULE_ID } from "./inspector-popup.js";

const HOVER_DELAY = 1000;
const CREATURE_TYPES = ["character", "npc", "familiar"];

let hoverTimer = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "visibility", {
    name: "PF2ECI.Settings.Visibility.Name",
    hint: "PF2ECI.Settings.Visibility.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      everyone: "PF2ECI.Settings.Visibility.Everyone",
      gm: "PF2ECI.Settings.Visibility.GMOnly"
    },
    default: "everyone"
  });

  game.settings.register(MODULE_ID, "hideFromPlayers", {
    name: "PF2ECI.Settings.HideFromPlayers.Name",
    hint: "PF2ECI.Settings.HideFromPlayers.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "obscureInfo", {
    name: "PF2ECI.Settings.ObscureInfo.Name",
    hint: "PF2ECI.Settings.ObscureInfo.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "granularInfo", {
    name: "PF2ECI.Settings.GranularInfo.Name",
    hint: "PF2ECI.Settings.GranularInfo.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
});

Hooks.on("hoverToken", (token, hovered) => {
  cancelHoverTimer();
  if (hovered) {
    if (!canInspect(token)) return;
    // Re-hovering the token of the currently open popup just keeps it alive.
    if (InspectorPopup.current?.token === token && InspectorPopup.current.rendered) {
      InspectorPopup.cancelClose();
      return;
    }
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (!token.destroyed && token.hover) InspectorPopup.show(token);
    }, HOVER_DELAY);
  } else {
    InspectorPopup.scheduleClose();
  }
});

/** Re-render open popups when reveal flags (or anything else) change. */
Hooks.on("updateActor", (actor) => {
  const popup = InspectorPopup.current;
  if (popup?.rendered && popup.actor?.uuid === actor.uuid) popup.render();
});

Hooks.on("deleteToken", (tokenDoc) => {
  if (InspectorPopup.current?.token?.document === tokenDoc) InspectorPopup.hide();
});

Hooks.on("canvasTearDown", () => {
  cancelHoverTimer();
  InspectorPopup.hide();
});

/** Keep the popup anchored to the token while the canvas pans or zooms. */
Hooks.on("canvasPan", () => {
  const popup = InspectorPopup.current;
  if (popup?.rendered) popup.repositionToToken();
});

function cancelHoverTimer() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function canInspect(token) {
  const actor = token?.actor;
  if (!actor || !CREATURE_TYPES.includes(actor.type)) return false;
  const visibility = game.settings.get(MODULE_ID, "visibility");
  if (visibility === "gm" && !game.user.isGM) return false;
  return true;
}
