export const MODULE_ID = "pf2e-creature-inspector";

const SECTIONS = ["saves", "immunities", "weaknesses", "resistances"];
const IWR_SECTIONS = ["immunities", "weaknesses", "resistances"];
const GRANULAR_SECTIONS = ["saves", ...IWR_SECTIONS];
const SAVE_SLUGS = ["fortitude", "reflex", "will"];
const CLOSE_DELAY = 300;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A small frameless popup anchored next to a hovered token, showing the
 * creature's name, saving throws, and IWR data. Only one instance is ever
 * open at a time (see InspectorPopup.current).
 */
export class InspectorPopup extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {InspectorPopup|null} */
  static current = null;

  static #closeTimer = null;

  #listenersAttached = false;

  constructor(token, options = {}) {
    super(options);
    this.token = token;
  }

  static DEFAULT_OPTIONS = {
    id: "pf2e-creature-inspector-popup",
    classes: ["pf2e-creature-inspector"],
    window: {
      frame: false,
      positioned: false
    },
    actions: {
      toggleReveal: InspectorPopup.#onToggleReveal,
      toggleItemReveal: InspectorPopup.#onToggleItemReveal,
      revealAll: InspectorPopup.#onRevealAll,
      hideAll: InspectorPopup.#onHideAll
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/popup.hbs`
    }
  };

  get actor() {
    return this.token?.actor ?? null;
  }

  /* -------------------------------------------- */
  /*  Singleton management                        */
  /* -------------------------------------------- */

  /** Open a popup for the given token, replacing any existing popup. */
  static async show(token) {
    if (this.current?.token === token && this.current.rendered) {
      this.cancelClose();
      return this.current;
    }
    await this.hide();
    const popup = new this(token);
    this.current = popup;
    await popup.render({ force: true });
    return popup;
  }

  /** Close the current popup immediately. */
  static async hide() {
    this.cancelClose();
    const popup = this.current;
    this.current = null;
    if (popup?.rendered) await popup.close({ animate: false });
  }

  /**
   * Close the current popup after a short grace period, giving the cursor
   * time to travel from the token onto the popup element.
   */
  static scheduleClose() {
    this.cancelClose();
    this.#closeTimer = setTimeout(() => {
      this.#closeTimer = null;
      this.hide();
    }, CLOSE_DELAY);
  }

  static cancelClose() {
    if (this.#closeTimer) {
      clearTimeout(this.#closeTimer);
      this.#closeTimer = null;
    }
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const isGM = game.user.isGM;
    const hideEnabled = game.settings.get(MODULE_ID, "hideFromPlayers");
    const revealed = this.#getRevealedFlags(actor);
    const isHidden = (section) => !isGM && hideEnabled && !revealed[section];

    const granularInfo = game.settings.get(MODULE_ID, "granularInfo");
    const revealedItems = this.#getRevealedItemFlags(actor);
    const obscureInfo = game.settings.get(MODULE_ID, "obscureInfo");
    const savesSectionRevealed = revealed.saves;
    const savesSectionHidden = !isGM && hideEnabled && !savesSectionRevealed;

    const mods = SAVE_SLUGS.map((slug) => actor?.saves?.[slug]?.mod ?? 0);
    const ranks = this.#rankSaves(mods);
    const allSaves = SAVE_SLUGS.map((slug, i) => {
      const label = game.i18n.localize(`PF2ECI.Popup.${slug.capitalize()}`);
      const itemRevealed = savesSectionRevealed || revealedItems.saves.includes(slug);
      const playerHidden = !isGM && hideEnabled && !itemRevealed;
      const obscured = playerHidden && obscureInfo;
      const mod = mods[i] >= 0 ? `+${mods[i]}` : `${mods[i]}`;
      const value =
        playerHidden && !obscureInfo ? game.i18n.localize("PF2ECI.Popup.Hidden")
        : obscured ? ranks[i]
        : mod;
      const playerPreview = isGM && hideEnabled && obscureInfo ? ranks[i] : null;
      return {
        key: slug,
        label,
        value: isGM ? mod : value,
        hidden: playerHidden && !obscureInfo,
        obscured,
        revealed: itemRevealed,
        playerPreview
      };
    });

    let saveValues = allSaves;
    let savesHidden = false;
    if (savesSectionHidden) {
      if (granularInfo) {
        saveValues = allSaves.filter((save) => save.revealed || save.obscured);
        savesHidden = saveValues.length === 0;
      } else {
        saveValues = [];
        savesHidden = true;
      }
    }

    const iwr = IWR_SECTIONS.map((key) => {
      const all = this.#formatIWR(actor?.attributes?.[key] ?? []).map((item) => ({
        ...item,
        revealed: revealed[key] || revealedItems[key].includes(item.key)
      }));
      let items = all;
      let hidden = false;
      if (isHidden(key)) {
        // Granular Info lets individually revealed entries through; the
        // section stays ??? only if nothing has been revealed yet.
        items = granularInfo ? all.filter((i) => i.revealed) : [];
        hidden = items.length === 0;
      }
      return {
        key,
        label: game.i18n.localize(`PF2ECI.Popup.${key.capitalize()}`),
        hidden,
        revealed: revealed[key],
        granular: isGM && hideEnabled && granularInfo,
        items
      };
    });

    return foundry.utils.mergeObject(context, {
      name: this.token?.document?.name ?? actor?.name ?? "",
      showToggles: isGM && hideEnabled,
      saves: {
        label: game.i18n.localize("PF2ECI.Popup.Saves"),
        hidden: savesHidden,
        granular: isGM && hideEnabled && granularInfo,
        revealed: savesSectionRevealed,
        values: isGM && hideEnabled && granularInfo ? allSaves : saveValues
      },
      iwr
    });
  }

  /**
   * Rank each save modifier relative to the other two, returning localized
   * labels: Equal (all three the same), Highest (2) / Lowest (2) (tied pair
   * above/below the third), or Highest / Middle / Lowest.
   */
  #rankSaves(mods) {
    return mods.map((mod) => {
      const higher = mods.filter((m) => m > mod).length;
      const equal = mods.filter((m) => m === mod).length; // includes self
      const key =
        equal === 3 ? "Equal"
        : equal === 2 ? (higher === 0 ? "Highest2" : "Lowest2")
        : higher === 0 ? "Highest"
        : higher === 2 ? "Lowest"
        : "Middle";
      return game.i18n.localize(`PF2ECI.Popup.Rank.${key}`);
    });
  }

  #getRevealedFlags(actor) {
    const stored = actor?.getFlag(MODULE_ID, "revealed") ?? {};
    const revealed = {};
    for (const section of SECTIONS) revealed[section] = stored[section] === true;
    return revealed;
  }

  /**
   * Turn PF2e Immunity/Weakness/Resistance objects into display items with a
   * stable key (the IWR type slug) used for per-entry reveal flags.
   */
  #formatIWR(entries) {
    return entries.map((entry) => {
      const label = entry.label ?? entry.typeLabel ?? entry.type ?? "";
      // Weaknesses and resistances have a numeric value; PF2e labels usually
      // include it already, but append it if the label omitted it.
      const value = entry.value;
      const text =
        typeof value === "number" && !label.includes(String(value)) ? `${label} ${value}` : label;
      return { key: entry.type ?? label, text };
    });
  }

  #getRevealedItemFlags(actor) {
    const stored = actor?.getFlag(MODULE_ID, "revealedItems") ?? {};
    const out = {};
    for (const key of GRANULAR_SECTIONS) out[key] = Array.isArray(stored[key]) ? stored[key] : [];
    return out;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#attachHoverListeners();
    this.repositionToToken();
  }

  _onClose(options) {
    super._onClose(options);
    if (InspectorPopup.current === this) InspectorPopup.current = null;
  }

  /**
   * Keep the popup open while the cursor is over it, so the GM can click
   * the reveal buttons. The root element persists across re-renders, so
   * these listeners are attached only once.
   */
  #attachHoverListeners() {
    if (this.#listenersAttached) return;
    this.#listenersAttached = true;
    this.element.addEventListener("mouseenter", () => InspectorPopup.cancelClose());
    this.element.addEventListener("mouseleave", () => InspectorPopup.scheduleClose());
  }

  /** Place the popup in screen space beside the token, flipping near edges. */
  repositionToToken() {
    const token = this.token;
    const el = this.element;
    if (!el || !token || token.destroyed) return;

    const bounds = token.bounds;
    const topLeft = canvas.clientCoordinatesFromCanvas({ x: bounds.left, y: bounds.top });
    const topRight = canvas.clientCoordinatesFromCanvas({ x: bounds.right, y: bounds.top });
    const margin = 12;
    const padding = 8;
    const { offsetWidth: width, offsetHeight: height } = el;

    let left = topRight.x + margin;
    if (left + width > window.innerWidth - padding) left = topLeft.x - width - margin;
    left = Math.max(padding, left);

    let top = topRight.y;
    top = Math.max(padding, Math.min(top, window.innerHeight - height - padding));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  /* -------------------------------------------- */
  /*  GM reveal actions                           */
  /* -------------------------------------------- */

  static async #onToggleReveal(event, target) {
    const section = target.dataset.section;
    const actor = this.actor;
    if (!actor || !SECTIONS.includes(section)) return;
    const current = actor.getFlag(MODULE_ID, `revealed.${section}`) === true;
    await actor.setFlag(MODULE_ID, `revealed.${section}`, !current);
    // The updateActor hook re-renders open popups on all clients.
  }

  static async #onToggleItemReveal(event, target) {
    const { section, key } = target.dataset;
    const actor = this.actor;
    if (!actor || !GRANULAR_SECTIONS.includes(section) || !key) return;
    if (section === "saves" && !SAVE_SLUGS.includes(key)) return;
    const list = new Set(actor.getFlag(MODULE_ID, `revealedItems.${section}`) ?? []);
    if (list.has(key)) list.delete(key);
    else list.add(key);
    await actor.setFlag(MODULE_ID, `revealedItems.${section}`, Array.from(list));
  }

  static async #onRevealAll(event, target) {
    const actor = this.actor;
    if (!actor) return;
    const revealed = Object.fromEntries(SECTIONS.map((s) => [s, true]));
    await actor.setFlag(MODULE_ID, "revealed", revealed);
  }

  static async #onHideAll(event, target) {
    const actor = this.actor;
    if (!actor) return;
    const revealed = Object.fromEntries(SECTIONS.map((s) => [s, false]));
    const revealedItems = Object.fromEntries(GRANULAR_SECTIONS.map((s) => [s, []]));
    await actor.update({
      [`flags.${MODULE_ID}.revealed`]: revealed,
      [`flags.${MODULE_ID}.revealedItems`]: revealedItems
    });
  }
}
