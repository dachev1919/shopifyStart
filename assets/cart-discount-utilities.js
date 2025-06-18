import { morph } from './morph';
/**
 * @namespace ThemeEvents
 * @description A collection of theme-specific events that can be used to trigger and listen for changes anywhere in the theme.
 * @example
 * document.dispatchEvent(new VariantUpdateEvent(variant, sectionId, { html }));
 * document.addEventListener(ThemeEvents.variantUpdate, (e) => { console.log(e.detail.variant) });
 */
export class ThemeEvents {
  /** @static @constant {string} Event triggered when a variant is selected */
  static variantSelected = 'variant:selected';
  /** @static @constant {string} Event triggered when a variant is changed */
  static variantUpdate = 'variant:update';
  /** @static @constant {string} Event triggered when the cart items or quantities are updated */
  static cartUpdate = 'cart:update';
  /** @static @constant {string} Event triggered when a cart update fails */
  static cartError = 'cart:error';
  /** @static @constant {string} Event triggered when a media (video, 3d model) is loaded */
  static mediaStartedPlaying = 'media:started-playing';
  // Event triggered when quantity-selector value is changed
  static quantitySelectorUpdate = 'quantity-selector:update';
  /** @static @constant {string} Event triggered when a predictive search is expanded */
  static megaMenuHover = 'megaMenu:hover';
  /** @static @constant {string} Event triggered when a zoom dialog media is selected */
  static zoomMediaSelected = 'zoom-media:selected';
  /** @static @constant {string} Event triggered when a discount is applied */
  static discountUpdate = 'discount:update';
  /** @static @constant {string} Event triggered when changing collection filters */
  static FilterUpdate = 'filter:update';
}

/**
 * Request an idle callback or fallback to setTimeout
 * @returns {function} The requestIdleCallback function
 */
export const requestIdleCallback =
  typeof window.requestIdleCallback == 'function' ? window.requestIdleCallback : setTimeout;

/**
 * Morphs the existing section element with the new section contents
 *
 * @param {string} sectionId - The section ID
 * @param {string} html - The new markup the section should morph into
 */
export async function morphSection(sectionId, html) {
  const fragment = new DOMParser().parseFromString(html, 'text/html');
  const existingElement = document.getElementById(buildSectionSelector(sectionId));
  const newElement = fragment.getElementById(buildSectionSelector(sectionId));

  if (!existingElement) {
    throw new Error(`Section ${sectionId} not found`);
  }

  if (!newElement) {
    throw new Error(`Section ${sectionId} not found in the section rendering response`);
  }

  morph(existingElement, newElement);
}

/**
 * Event class for quantity-selector updates
 * @extends {Event}
 */
export class DiscountUpdateEvent extends Event {
  /**
   * Creates a new DiscountUpdateEvent
   * @param {Object} resource - The new cart object
   * @param {string} sourceId - The id of the element the action was triggered from
   */
  constructor(resource, sourceId) {
    super(ThemeEvents.discountUpdate, { bubbles: true });
    this.detail = {
      resource,
      sourceId,
    };
  }
}