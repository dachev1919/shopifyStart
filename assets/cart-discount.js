class CartDiscount {
    constructor() {
        this.component = this;
        this.activeFetch = null;
        this.sectionId = this.dataset.sectionId;
      console.log(this)

        // Перевірка наявності необхідних елементів
        this.cartDiscountError = this.querySelector('[ref="cartDiscountError"]');
        this.cartDiscountErrorDiscountCode = this.querySelector('[ref="cartDiscountErrorDiscountCode"]');
        this.cartDiscountErrorShipping = this.querySelector('[ref="cartDiscountErrorShipping"]');

        if (!this.sectionId || !this.cartDiscountError || !this.cartDiscountErrorDiscountCode || !this.cartDiscountErrorShipping) {
            console.error('Відсутні необхідні елементи або sectionId');
            return;
        }

        // Ініціалізація слухачів подій
        this.initEventListeners();
    }

    // Створює контролер для скасування запитів
    createAbortController() {
        if (this.activeFetch) {
            this.activeFetch.abort();
        }
        const abortController = new AbortController();
        this.activeFetch = abortController;
        return abortController;
    }

    // Налаштування конфігурації для fetch-запитів
    fetchConfig(type, options = {}) {
        return {
            method: 'POST',
            headers: {
                'Content-Type': `application/${type}`,
                'Accept': `application/${type}`,
            },
            ...options
        };
    }

    // Отримує список існуючих кодів знижок
    existingDiscounts() {
        const discountCodes = [];
        const discountPills = this.component.querySelectorAll('.cart-discount__pill');
        discountPills.forEach(pill => {
            if (pill.dataset.discountCode) {
                discountCodes.push(pill.dataset.discountCode);
            }
        });
        return discountCodes;
    }

    // Обробка помилок знижок
    handleDiscountError(type) {
        const target = type === 'discount_code' ? this.cartDiscountErrorDiscountCode : this.cartDiscountErrorShipping;
        this.cartDiscountError.classList.remove('hidden');
        target.classList.remove('hidden');
    }

    // Застосування знижки
    async applyDiscount(event) {
        event.preventDefault();
        event.stopPropagation();

        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;

        const discountCode = form.querySelector('input[name="discount"]');
        if (!(discountCode instanceof HTMLInputElement)) return;

        const discountCodeValue = discountCode.value;
        const abortController = this.createAbortController();

        try {
            const existingDiscountsList = this.existingDiscounts();
            if (existingDiscountsList.includes(discountCodeValue)) return;

            this.cartDiscountError.classList.add('hidden');
            this.cartDiscountErrorDiscountCode.classList.add('hidden');
            this.cartDiscountErrorShipping.classList.add('hidden');

            const config = this.fetchConfig('json', {
                body: JSON.stringify({
                    discount: [...existingDiscountsList, discountCodeValue].join(','),
                    sections: [this.sectionId],
                }),
            });

            const response = await fetch('/cart/update.js', {
                ...config,
                signal: abortController.signal,
            });

            const data = await response.json();

            if (data.discount_codes.find(discount => 
                discount.code === discountCodeValue && discount.applicable === false
            )) {
                discountCode.value = '';
                this.handleDiscountError('discount_code');
                return;
            }

            const newHtml = data.sections[this.sectionId];
            const parsedHtml = new DOMParser().parseFromString(newHtml, 'text/html');
            const section = parsedHtml.getElementById(`shopify-section-${this.sectionId}`);
            
            if (section) {
                const discountCodes = section.querySelectorAll('.cart-discount__pill');
                const codes = Array.from(discountCodes)
                    .map(element => element.dataset.discountCode)
                    .filter(Boolean);
                
                if (
                    codes.length === existingDiscountsList.length &&
                    codes.every(code => existingDiscountsList.includes(code)) &&
                    data.discount_codes.find(discount => 
                        discount.code === discountCodeValue && discount.applicable === true
                    )
                ) {
                    this.handleDiscountError('shipping');
                    discountCode.value = '';
                    return;
                }
            }

            document.dispatchEvent(new CustomEvent('discount:update', { 
                detail: { data, id: this.component.id } 
            }));

            const sectionContainer = document.getElementById(`shopify-section-${this.sectionId}`);
            if (sectionContainer) {
                sectionContainer.outerHTML = newHtml;
            }
        } catch (error) {
            console.error('Помилка при застосуванні знижки:', error);
        } finally {
            this.activeFetch = null;
        }
    }

    // Видалення знижки
    async removeDiscount(event) {
        event.preventDefault();
        event.stopPropagation();

        if (
            (event instanceof KeyboardEvent && event.key !== 'Enter') ||
            !(event instanceof MouseEvent)
        ) {
            return;
        }

        const pill = event.target.closest('.cart-discount__pill');
        if (!(pill instanceof HTMLLIElement)) return;

        const discountCode = pill.dataset.discountCode;
        if (!discountCode) return;

        const existingDiscountsList = this.existingDiscounts();
        const index = existingDiscountsList.indexOf(discountCode);
        if (index === -1) return;

        existingDiscountsList.splice(index, 1);
        const abortController = this.createAbortController();

        try {
            const config = this.fetchConfig('json', {
                body: JSON.stringify({ 
                    discount: existingDiscountsList.join(','), 
                    sections: [this.sectionId] 
                }),
            });

            const response = await fetch('/cart/update.js', {
                ...config,
                signal: abortController.signal,
            });

            const data = await response.json();

            document.dispatchEvent(new CustomEvent('discount:update', { 
                detail: { data, id: this.component.id } 
            }));

            const sectionContainer = document.getElementById(`shopify-section-${this.sectionId}`);
            if (sectionContainer) {
                sectionContainer.outerHTML = data.sections[this.sectionId];
            }
        } catch (error) {
            console.error('Помилка при видаленні знижки:', error);
        } finally {
            this.activeFetch = null;
        }
    }

    // Ініціалізація слухачів подій
    initEventListeners() {
        this.component.querySelectorAll('form[on\\:submit="/applyDiscount"]').forEach(form => {
            form.addEventListener('submit', this.applyDiscount.bind(this));
        });

        this.component.querySelectorAll('[on\\:click="/removeDiscount"]').forEach(button => {
            button.addEventListener('click', this.removeDiscount.bind(this));
        });
    }
}

// Ініціалізація всіх компонентів на сторінці
if (!customElements.get('cart-discount-component')) {
  customElements.define('cart-discount-component', CartDiscount);
}