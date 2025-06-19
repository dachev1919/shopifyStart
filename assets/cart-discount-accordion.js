export class CartDiscountAccordion extends HTMLElement {
  get details() {
    const details = this.querySelector('details');
    if (!(details instanceof HTMLDetailsElement)) throw new Error('Details element not found');
    return details;
  }

  get content() {
    const content = this.querySelector('.details-content');
    if (!(content instanceof HTMLElement)) throw new Error('Content element not found');
    return content;
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

  #controller = new AbortController();

  connectedCallback() {
    const { signal } = this.#controller;
    this.#setDefaultOpenState();
    this.addEventListener('keydown', this.#handleKeyDown, { signal });
    this.summary.addEventListener('click', this.handleClick, { signal });
    matchMedia('(width >= 750px)').addEventListener('change', this.#handleMediaQueryChange, { signal });
  }

  disconnectedCallback() {
    // Disconnect all the event listeners
    this.#controller.abort();
  }

  handleClick = (event) => {
    event.preventDefault();
    const isMobile = !matchMedia('(width >= 750px)').matches;
    const isDesktop = !isMobile;
    if ((isMobile && this.#disableOnMobile) || (isDesktop && this.#disableOnDesktop)) {
      return;
    }
    // Add an overflow on the <details> to avoid content overflowing
    this.details.style.overflow = 'hidden';
    if (this.isClosing || !this.details.open) {
      this.open();
    } else if (this.isExpanding || this.details.open) {
      this.shrink();
    }
  };

  #handleMediaQueryChange = () => {
    this.#setDefaultOpenState();
  };

  // Sets the default open state of the accordion based on the `open-by-default-on-mobile` and `open-by-default-on-desktop` attributes
  #setDefaultOpenState() {
    const isMobile = !matchMedia('(width >= 750px)').matches;
    this.details.open =
      (isMobile && this.hasAttribute('open-by-default-on-mobile')) ||
      (!isMobile && this.hasAttribute('open-by-default-on-desktop'));
  }

  #handleKeyDown(event) {
    console.log(event);
    console.log(this);
    // Close the accordion when used as a menu
    if (event.key === 'Escape' && this.#closeWithEscape) {
      event.preventDefault();
      this.shrink();
      this.summary.focus();
    }
  }

  ANIMATION_DURATION = {
    EXPAND: 250,
    SHRINK: 250
  };

  ANIMATION_EASING = {
    EXPAND: 'ease-out',
    SHRINK: 'ease'
  };

  animateHeight(element, startHeight, endHeight, duration, easing) {
    return element.animate(
      { height: [startHeight, endHeight] },
      { duration, easing }
    );
  }

  shrink() {
    if (!this.details || !this.summary) {
      console.warn('Missing required DOM elements for shrink operation.');
      return;
    }
    this.isClosing = true;
    const startHeight = `${this.details.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight}px`;
    if (this.animation) {
      this.animation.cancel();
    }
    this.animation = this.animateHeight(
      this.details,
      startHeight,
      endHeight,
      this.ANIMATION_DURATION.SHRINK,
      this.ANIMATION_EASING.SHRINK
    );
    this.animation.onfinish = () => this.onAnimationFinish(false);
    this.animation.oncancel = () => this.isClosing = false;
  }

  open() {
    if (!this.details) {
      console.warn('Missing details element for open operation.');
      return;
    }
    // Use requestAnimationFrame to ensure styles are applied before expanding
    this.details.style.height = `${this.details.offsetHeight}px`;
    this.details.style.overflow = 'hidden';
    window.requestAnimationFrame(() => this.expand());
  }

  expand() {
    if (!this.details || !this.summary || !this.content) {
      console.warn('Missing required DOM elements for expand operation.');
      return;
    }
    this.isExpanding = true;
    const startHeight = `${this.details.offsetHeight}px`;
    this.details.open = true;
    const endHeight = `${this.summary.offsetHeight + this.content.offsetHeight}px`;
    if (this.animation) {
      this.animation.cancel();
    }
    this.animation = this.animateHeight(
      this.details,
      startHeight,
      endHeight,
      this.ANIMATION_DURATION.EXPAND,
      this.ANIMATION_EASING.EXPAND
    );
    this.animation.onfinish = () => this.onAnimationFinish(true);
    this.animation.oncancel = () => this.isExpanding = false;
  }

  onAnimationFinish(open) {
    if (!this.details) {
      console.warn('Missing details element for animation finish.');
      return;
    }
    this.details.open = open;
    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    this.details.style.height = '';
    this.details.style.overflow = '';
  }
}