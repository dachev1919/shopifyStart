class DeclarativeShadowElement extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      const template = this.querySelector(':scope > template[shadowrootmode="open"]');

      if (!(template instanceof HTMLTemplateElement)) return;

      const shadow = this.attachShadow({ mode: 'open' });
      shadow.append(template.content.cloneNode(true));
    }
  }
}
function registerEventListeners() {
  if (initialized) return;
  initialized = true;

  const events = ['click', 'change', 'select', 'focus', 'blur', 'submit', 'input', 'keydown', 'keyup', 'toggle'];
  const shouldBubble = ['focus', 'blur'];
  const expensiveEvents = ['pointerenter', 'pointerleave'];

  for (const eventName of [...events, ...expensiveEvents]) {
    const attribute = `on:${eventName}`;

    document.addEventListener(
      eventName,
      (event) => {
        const element = getElement(event);

        if (!element) return;

        const proxiedEvent =
          event.target !== element
            ? new Proxy(event, {
                get(target, property) {
                  if (property === 'target') return element;

                  const value = Reflect.get(target, property);

                  if (typeof value === 'function') {
                    return value.bind(target);
                  }

                  return value;
                },
              })
            : event;

        const value = element.getAttribute(attribute) ?? '';
        let [selector, method] = value.split('/');
        // Extract the last segment of the attribute value delimited by `?` or `/`
        const data = value.match(/(?<=[\/\?][^\/\?]+)[\/\?][^\/\?]+$/)?.[0];
        const instance = selector
          ? selector.startsWith('#')
            ? document.querySelector(selector)
            : element.closest(selector)
          : getClosestComponent(element);

        if (!(instance instanceof Component) || !method) return;

        method = method.replace(/\?.*/, '');

        const callback = /** @type {any} */ (instance)[method];

        if (typeof callback === 'function') {
          try {
            /** @type {(Event | Data)[]} */
            const args = [proxiedEvent];

            if (data) args.unshift(parseData(data));

            callback.call(instance, ...args);
          } catch (error) {
            console.error(error);
          }
        }
      },
      { capture: true }
    );
  }

  /** @param {Event} event */
  function getElement(event) {
    const target = event.composedPath?.()[0] ?? event.target;

    if (!(target instanceof Element)) return;

    if (target.hasAttribute(`on:${event.type}`)) {
      return target;
    }

    if (expensiveEvents.includes(event.type)) {
      return null;
    }

    return event.bubbles || shouldBubble.includes(event.type) ? target.closest(`[on\\:${event.type}]`) : null;
  }
}
class Component extends DeclarativeShadowElement {
  /**
   * An object holding references to child elements with `ref` attributes.
   *
   * @type {RefsType<T>}
   */
  refs = /** @type {RefsType<T>} */ ({});

  /**
   * An array of required refs. If a ref is not found, an error will be thrown.
   *
   * @type {string[] | undefined}
   */
  requiredRefs;

  /**
   * Gets the root node of the component, which is either its shadow root or the component itself.
   *
   * @returns {(ShadowRoot | Component<T>)[]} The root nodes.
   */
  get roots() {
    return this.shadowRoot ? [this, this.shadowRoot] : [this];
  }

  /**
   * Called when the element is connected to the document's DOM.
   *
   * Initializes event listeners and refs.
   */
  connectedCallback() {
    super.connectedCallback();
    registerEventListeners();

    this.#updateRefs();

    requestIdleCallback(() => {
      for (const root of this.roots) {
        this.#mutationObserver.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['ref'],
          attributeOldValue: true,
        });
      }
    });
  }

  /**
   * Called when the element is re-rendered by the Section Rendering API.
   */
  updatedCallback() {
    this.#mutationObserver.takeRecords();
    this.#updateRefs();
  }

  /**
   * Called when the element is disconnected from the document's DOM.
   *
   * Disconnects the mutation observer.
   */
  disconnectedCallback() {
    this.#mutationObserver.disconnect();
  }

  /**
   * Updates the `refs` object by querying all descendant elements with `ref` attributes and storing references to them.
   *
   * This method is called to keep the `refs` object in sync with the DOM.
   */
  #updateRefs() {
    const refs = /** @type any */ ({});
    const elements = this.roots.reduce((acc, root) => {
      for (const element of root.querySelectorAll('[ref]')) {
        if (!this.#isDescendant(element)) continue;
        acc.add(element);
      }

      return acc;
    }, /** @type {Set<Element>} */ (new Set()));

    for (const ref of elements) {
      const refName = ref.getAttribute('ref') ?? '';
      const isArray = refName.endsWith('[]');
      const path = isArray ? refName.slice(0, -2) : refName;

      if (isArray) {
        const array = Array.isArray(refs[path]) ? refs[path] : [];

        array.push(ref);
        refs[path] = array;
      } else {
        refs[path] = ref;
      }
    }

    if (this.requiredRefs?.length) {
      for (const ref of this.requiredRefs) {
        if (!(ref in refs)) {
          throw new MissingRefError(ref, this);
        }
      }
    }

    this.refs = /** @type {RefsType<T>} */ (refs);
  }

  /**
   * MutationObserver instance to observe changes in the component's DOM subtree and update refs accordingly.
   *
   * @type {MutationObserver}
   */
  #mutationObserver = new MutationObserver((mutations) => {
    if (
      mutations.some(
        (m) =>
          (m.type === 'attributes' && this.#isDescendant(m.target)) ||
          (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].some(this.#isDescendant))
      )
    ) {
      this.#updateRefs();
    }
  });

  /**
   * Checks if a given node is a descendant of this component.
   *
   * @param {Node} node - The node to check.
   * @returns {boolean} True if the node is a descendant of this component.
   */
  #isDescendant = (node) => getClosestComponent(getAncestor(node)) === this;
}
async function morphSection(sectionId, html) {
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
class DiscountUpdateEvent extends Event {
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
function fetchConfig(type = 'json', config = {}) {
  /** @type {Headers} */
  const headers = { 'Content-Type': 'application/json', Accept: `application/${type}`, ...config.headers };

  if (type === 'javascript') {
    headers['X-Requested-With'] = 'XMLHttpRequest';
    delete headers['Content-Type'];
  }

  return {
    method: 'POST',
    headers: /** @type {HeadersInit} */ (headers),
    body: config.body,
  };
}

class ThemePerformance {
  /**
   * @param {string} metricPrefix
   */
  constructor(metricPrefix) {
    this.metricPrefix = metricPrefix;
  }

  /**
   * @param {string} benchmarkName
   * @returns {PerformanceMark}
   */
  createStartingMarker(benchmarkName) {
    const metricName = `${this.metricPrefix}:${benchmarkName}`
    return performance.mark(`${metricName}:start`);
  }

  /**
   * @param {string} benchmarkName
   * @param {Event} event
   * @returns {void}
   */
  measureFromEvent(benchmarkName, event) {
    const metricName = `${this.metricPrefix}:${benchmarkName}`
    const startMarker = performance.mark(`${metricName}:start`, {
      startTime: event.timeStamp
    });

    performance.mark(`${metricName}:end`);

    performance.measure(
      metricName,
      `${metricName}:start`,
      `${metricName}:end`
    );
  }

  /**
   * @param {PerformanceMark} startMarker
   * @returns {void}
   */
  measureFromMarker(startMarker) {
    const metricName = startMarker.name.replace(/:start$/, '');
    const endMarker = performance.mark(`${metricName}:end`);

    performance.measure(
      metricName,
      startMarker.name,
      endMarker.name
    );
  }

  /**
   * @param {string} benchmarkName
   * @param {Function} callback
   * @returns {void}
   */
  measure(benchmarkName, callback) {
    const metricName = `${this.metricPrefix}:${benchmarkName}`
    performance.mark(`${metricName}:start`);

    callback();

    performance.mark(`${metricName}:end`);

    performance.measure(
      benchmarkName,
      `${metricName}:start`,
      `${metricName}:end`
    );
  }
}
const cartPerformance = new ThemePerformance('cart-performance');

/**
 * A custom element that applies a discount to the cart.
 *
 * @typedef {Object} CartDiscountComponentRefs
 * @property {HTMLElement} cartDiscountError - The error element.
 * @property {HTMLElement} cartDiscountErrorDiscountCode - The discount code error element.
 * @property {HTMLElement} cartDiscountErrorShipping - The shipping error element.
 */

/**
 * @extends {Component<CartDiscountComponentRefs>}
 */
class CartDiscount extends Component {
  requiredRefs = ['cartDiscountError', 'cartDiscountErrorDiscountCode', 'cartDiscountErrorShipping'];

  /** @type {AbortController | null} */
  #activeFetch = null;

  #createAbortController() {
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }

    const abortController = new AbortController();
    this.#activeFetch = abortController;
    return abortController;
  }

  /**
   * Handles updates to the cart note.
   * @param {SubmitEvent} event - The submit event on our form.
   */
  applyDiscount = async (event) => {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;

    event.preventDefault();
    event.stopPropagation();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const discountCode = form.querySelector('input[name="discount"]');
    if (!(discountCode instanceof HTMLInputElement) || typeof this.dataset.sectionId !== 'string') return;

    const discountCodeValue = discountCode.value;

    const abortController = this.#createAbortController();

    try {
      const existingDiscounts = this.#existingDiscounts();
      if (existingDiscounts.includes(discountCodeValue)) return;

      cartDiscountError.classList.add('hidden');
      cartDiscountErrorDiscountCode.classList.add('hidden');
      cartDiscountErrorShipping.classList.add('hidden');

      const config = fetchConfig('json', {
        body: JSON.stringify({
          discount: [...existingDiscounts, discountCodeValue].join(','),
          sections: [this.dataset.sectionId],
        }),
      });

      const response = await fetch(Theme.routes.cart_update_url, {
        ...config,
        signal: abortController.signal,
      });

      const data = await response.json();

      if (
        data.discount_codes.find((/** @type {{ code: string; applicable: boolean; }} */ discount) => {
          return discount.code === discountCodeValue && discount.applicable === false;
        })
      ) {
        discountCode.value = '';
        this.#handleDiscountError('discount_code');
        return;
      }

      const newHtml = data.sections[this.dataset.sectionId];
      const parsedHtml = new DOMParser().parseFromString(newHtml, 'text/html');
      const section = parsedHtml.getElementById(`shopify-section-${this.dataset.sectionId}`);
      const discountCodes = section?.querySelectorAll('.cart-discount__pill') || [];
      if (section) {
        const codes = Array.from(discountCodes)
          .map((element) => (element instanceof HTMLLIElement ? element.dataset.discountCode : null))
          .filter(Boolean);
        // Before morphing, we need to check if the shipping discount is applicable in the UI
        // we check the liquid logic compared to the cart payload to assess whether we leveraged
        // a valid shipping discount code.
        if (
          codes.length === existingDiscounts.length &&
          codes.every((/** @type {string} */ code) => existingDiscounts.includes(code)) &&
          data.discount_codes.find((/** @type {{ code: string; applicable: boolean; }} */ discount) => {
            return discount.code === discountCodeValue && discount.applicable === true;
          })
        ) {
          this.#handleDiscountError('shipping');
          discountCode.value = '';
          return;
        }
      }

      document.dispatchEvent(new DiscountUpdateEvent(data, this.id));
      morphSection(this.dataset.sectionId, newHtml);
    } catch (error) {
    } finally {
      this.#activeFetch = null;
      cartPerformance.measureFromEvent('discount-update:user-action', event);
    }
  };

  /**
   * Handles removing a discount from the cart.
   * @param {MouseEvent | KeyboardEvent} event - The mouse or keyboard event in our pill.
   */
  removeDiscount = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      (event instanceof KeyboardEvent && event.key !== 'Enter') ||
      !(event instanceof MouseEvent) ||
      !(event.target instanceof HTMLElement) ||
      typeof this.dataset.sectionId !== 'string'
    ) {
      return;
    }

    const pill = event.target.closest('.cart-discount__pill');
    if (!(pill instanceof HTMLLIElement)) return;

    const discountCode = pill.dataset.discountCode;
    if (!discountCode) return;

    const existingDiscounts = this.#existingDiscounts();
    const index = existingDiscounts.indexOf(discountCode);
    if (index === -1) return;

    existingDiscounts.splice(index, 1);

    const abortController = this.#createAbortController();

    try {
      const config = fetchConfig('json', {
        body: JSON.stringify({ discount: existingDiscounts.join(','), sections: [this.dataset.sectionId] }),
      });

      const response = await fetch(Theme.routes.cart_update_url, {
        ...config,
        signal: abortController.signal,
      });

      const data = await response.json();

      document.dispatchEvent(new DiscountUpdateEvent(data, this.id));
      morphSection(this.dataset.sectionId, data.sections[this.dataset.sectionId]);
    } catch (error) {
    } finally {
      this.#activeFetch = null;
    }
  };

  /**
   * Handles the discount error.
   *
   * @param {'discount_code' | 'shipping'} type - The type of discount error.
   */
  #handleDiscountError(type) {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;
    const target = type === 'discount_code' ? cartDiscountErrorDiscountCode : cartDiscountErrorShipping;
    cartDiscountError.classList.remove('hidden');
    target.classList.remove('hidden');
  }

  /**
   * Returns an array of existing discount codes.
   * @returns {string[]}
   */
  #existingDiscounts() {
    /** @type {string[]} */
    const discountCodes = [];
    const discountPills = this.querySelectorAll('.cart-discount__pill');
    for (const pill of discountPills) {
      if (pill instanceof HTMLLIElement && typeof pill.dataset.discountCode === 'string') {
        discountCodes.push(pill.dataset.discountCode);
      }
    }

    return discountCodes;
  }
}

if (!customElements.get('cart-discount-component')) {
  customElements.define('cart-discount-component', CartDiscount);
}
