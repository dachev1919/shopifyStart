/**
 * A standalone script to handle cart discount functionality.
 */
class CartDiscount {
  constructor(element) {
    // Required DOM elements
    this.element = element;
    this.cartDiscountError = element.querySelector('[data-ref="cartDiscountError"]');
    this.cartDiscountErrorDiscountCode = element.querySelector('[data-ref="cartDiscountErrorDiscountCode"]');
    this.cartDiscountErrorShipping = element.querySelector('[data-ref="cartDiscountErrorShipping"]');
    this.sectionId = element.dataset.sectionId;

    // Abort controller for fetch requests
    this.activeFetch = null;

    // Bind methods
    this.applyDiscount = this.applyDiscount.bind(this);
    this.removeDiscount = this.removeDiscount.bind(this);

    // Initialize event listeners
    this.init();
  }

  init() {
    const form = this.element.querySelector('form');
    if (form) {
      form.addEventListener('submit', this.applyDiscount);
    }
    this.element.addEventListener('click', this.removeDiscount);
    this.element.addEventListener('keydown', this.removeDiscount);
  }

  #createAbortController() {
    if (this.activeFetch) {
      this.activeFetch.abort();
    }
    const abortController = new AbortController();
    this.activeFetch = abortController;
    return abortController;
  }

  applyDiscount(event) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const discountCode = form.querySelector('input[name="discount"]');
    if (!(discountCode instanceof HTMLInputElement) || !this.sectionId) return;

    const discountCodeValue = discountCode.value;

    const abortController = this.#createAbortController();

    const existingDiscounts = this.#existingDiscounts();
    if (existingDiscounts.includes(discountCodeValue)) return;

    // Hide error messages
    this.cartDiscountError.classList.add('hidden');
    this.cartDiscountErrorDiscountCode.classList.add('hidden');
    this.cartDiscountErrorShipping.classList.add('hidden');

    // Prepare fetch request
    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        discount: [...existingDiscounts, discountCodeValue].join(','),
        sections: [this.sectionId],
      }),
      signal: abortController.signal,
    };

    fetch(window.Theme?.routes?.cart_update_url || '/cart/update.js', config)
      .then((response) => response.json())
      .then((data) => {
        // Check for invalid discount code
        if (data.discount_codes.find((discount) => discount.code === discountCodeValue && !discount.applicable)) {
          discountCode.value = '';
          this.#handleDiscountError('discount_code');
          return;
        }

        const newHtml = data.sections[this.sectionId];
        const parsedHtml = new DOMParser().parseFromString(newHtml, 'text/html');
        const section = parsedHtml.getElementById(`shopify-section-${this.sectionId}`);
        const discountCodes = section?.querySelectorAll('.cart-discount__pill') || [];

        if (section) {
          const codes = Array.from(discountCodes)
            .map((element) => element.dataset.discountCode)
            .filter(Boolean);
          if (
            codes.length === existingDiscounts.length &&
            codes.every((code) => existingDiscounts.includes(code)) &&
            data.discount_codes.find((discount) => discount.code === discountCodeValue && discount.applicable)
          ) {
            this.#handleDiscountError('shipping');
            discountCode.value = '';
            return;
          }
        }

        // Update DOM
        const targetSection = document.getElementById(`shopify-section-${this.sectionId}`);
        if (targetSection && section) {
          targetSection.innerHTML = section.innerHTML;
        }

        // Dispatch custom event
        const discountUpdateEvent = new CustomEvent('discount-update', { detail: { data, id: this.element.id } });
        document.dispatchEvent(discountUpdateEvent);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Fetch error:', error);
        }
      })
      .finally(() => {
        this.activeFetch = null;
      });
  }

  removeDiscount(event) {
    event.preventDefault();
    event.stopPropagation();

    if (
      (event instanceof KeyboardEvent && event.key !== 'Enter') ||
      !(event.target instanceof HTMLElement) ||
      !this.sectionId
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

    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        discount: existingDiscounts.join(','),
        sections: [this.sectionId],
      }),
      signal: abortController.signal,
    };

    fetch(window.Theme?.routes?.cart_update_url || '/cart/update.js', config)
      .then((response) => response.json())
      .then((data) => {
        const targetSection = document.getElementById(`shopify-section-${this.sectionId}`);
        const newHtml = data.sections[this.sectionId];
        const parsedHtml = new DOMParser().parseFromString(newHtml, 'text/html');
        const section = parsedHtml.getElementById(`shopify-section-${this.sectionId}`);
        if (targetSection && section) {
          targetSection.innerHTML = section.innerHTML;
        }

        const discountUpdateEvent = new CustomEvent('discount-update', { detail: { data, id: this.element.id } });
        document.dispatchEvent(discountUpdateEvent);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Fetch error:', error);
        }
      })
      .finally(() => {
        this.activeFetch = null;
      });
  }

  #handleDiscountError(type) {
    const target = type === 'discount_code' ? this.cartDiscountErrorDiscountCode : this.cartDiscountErrorShipping;
    this.cartDiscountError.classList.remove('hidden');
    target.classList.remove('hidden');
  }

  #existingDiscounts() {
    const discountCodes = [];
    const discountPills = this.element.querySelectorAll('.cart-discount__pill');
    for (const pill of discountPills) {
      if (pill instanceof HTMLLIElement && pill.dataset.discountCode) {
        discountCodes.push(pill.dataset.discountCode);
      }
    }
    return discountCodes;
  }
}

// Initialize all cart-discount components
document.querySelectorAll('cart-discount-component').forEach((element) => {
  new CartDiscount(element);
});

/**
 * A standalone custom element for an accordion component.
 */
class AccordionCustom extends HTMLElement {
  constructor() {
    super();
    this.controller = new AbortController();
  }

  get details() {
    const details = this.querySelector('details');
    if (!(details instanceof HTMLDetailsElement)) throw new Error('Details element not found');
    return details;
  }

  get summary() {
    const summary = this.details.querySelector('summary');
    if (!(summary instanceof HTMLElement)) throw new Error('Summary element not found');
    return summary;
  }

  get #disableOnMobile() {
    return this.dataset.disableOnMobile === 'true';
  }

  get #disableOnDesktop() {
    return this.dataset.disableOnDesktop === 'true';
  }

  get #closeWithEscape() {
    return this.dataset.closeWithEscape === 'true';
  }

  connectedCallback() {
    const { signal } = this.controller;

    // Set up media query for large screens (768px and above)
    this.mediaQuery = window.matchMedia('(min-width: 768px)');
    
    // Bind methods
    this.handleClick = this.handleClick.bind(this);
    this.#handleMediaQueryChange = this.#handleMediaQueryChange.bind(this);
    this.#handleKeyDown = this.#handleKeyDown.bind(this);

    // Set initial open state
    this.#setDefaultOpenState();

    // Add event listeners
    this.addEventListener('keydown', this.#handleKeyDown, { signal });
    this.summary.addEventListener('click', this.handleClick, { signal });
    this.mediaQuery.addEventListener('change', this.#handleMediaQueryChange, { signal });
  }

  disconnectedCallback() {
    // Disconnect all event listeners
    this.controller.abort();
  }

  handleClick(event) {
    const isMobile = window.innerWidth < 768;
    const isDesktop = !isMobile;

    if ((isMobile && this.#disableOnMobile) || (isDesktop && this.#disableOnDesktop)) {
      event.preventDefault();
      return;
    }
  }

  #handleMediaQueryChange() {
    this.#setDefaultOpenState();
  }

  #setDefaultOpenState() {
    const isMobile = window.innerWidth < 768;
    this.details.open =
      (isMobile && this.hasAttribute('open-by-default-on-mobile')) ||
      (!isMobile && this.hasAttribute('open-by-default-on-desktop'));
  }

  #handleKeyDown(event) {
    if (event.key === 'Escape' && this.#closeWithEscape) {
      event.preventDefault();
      this.details.open = false;
      this.summary.focus();
    }
  }
}

if (!customElements.get('accordion-custom')) {
  customElements.define('accordion-custom', AccordionCustom);
}