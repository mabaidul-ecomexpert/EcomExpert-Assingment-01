
if (!customElements.get('product-bundle')) {
  class ProductBundle extends HTMLElement {
    constructor() {
      super();
      this.selectedItems = new Map();
      this.config = null;
    }

    connectedCallback() {
      this.loadConfig();
      this.setupStepToggles();
      this.initializeStepOpenStates();
      this.setupQuantityListeners();
      this.setupVariantListeners();
      this.setupReviewListeners();
      this.setupNextStepLinks();
    }
    
    disconnectedCallback() {
      this.selectedItems.clear();
    }

    loadConfig() {
      const configEl = this.querySelector('[data-bundle-config]');
      console.log("configEl", JSON.parse(configEl.textContent));
      if (configEl?.textContent) {
        try {
          this.config = JSON.parse(configEl.textContent);
        } catch {
          this.config = {};
        }
      }
    }

    formatMoney(cents) {
      if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
        return Shopify.formatMoney(cents);
      }
      return `$${(cents / 100).toFixed(2)}`;
    }

    getStepCounts() {
      const counts = new Map();
      for (const [, item] of this.selectedItems) {
        const idx = item.stepIndex >= 0 ? item.stepIndex : 999;
        counts.set(idx, (counts.get(idx) ?? 0) + item.quantity);
      }
      return counts;
    }

    updateStepCounts() {
      const counts = this.getStepCounts();
      this.querySelectorAll('[data-step-count]').forEach((el) => {
        const stepIndex = parseInt(el.dataset.stepIndex ?? '-1', 10);
        const count = counts.get(stepIndex) ?? 0;
        el.textContent = count === 1 ? '1 selected' : `${count} selected`;
      });
    }

    getTotalProductQuantity(productId) {
      let total = 0;

      for (const item of this.selectedItems.values()) {
        if(String(item.productId) === String(productId)) {
          total += item.quantity;
        }
      }

      return total;
    }

    updateCardSelectionStates() {
      this.querySelectorAll('.bundle-product-card').forEach((card) => {
        const productId = card.dataset.productId;
        const totalQty = productId ? this.getTotalProductQuantity(productId) : 0;
        const selected = totalQty > 0;
        card.setAttribute('data-selected', selected ? 'true' : 'false');
        card.setAttribute('data-total-qty', String(totalQty));
      });
    }

    initializeStepOpenStates() {
      this.querySelectorAll('.product-bundle__step').forEach((step) => {
        const toggle = step.querySelector('[data-step-toggle]');
        const panel = step.querySelector('[data-products-panel]');
        const isExpanded = toggle?.getAttribute('aria-expanded') === 'true' && !panel?.classList.contains('product-bundle__step--collapsed');
        step.classList.toggle('product-bundle__step--open', Boolean(isExpanded));
      })
    }

    setupStepToggles() {
      this.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-step-toggle]');
        if (!btn) return;
        
        const stepIndex = parseInt(btn.dataset.stepIndex ?? '-1', 10);
        const step = this.querySelector(`.product-bundle__step[data-step-index="${stepIndex}"]`);
        const panel = step?.querySelector('[data-products-panel]');
        if (!panel) return;

        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        panel.classList.toggle('product-bundle__step--collapsed', isExpanded);
        if(step) {
          step.classList.toggle('product-bundle__step--open', !isExpanded);
        }
        btn.setAttribute('aria-expanded', !isExpanded);
        btn.setAttribute('aria-label', isExpanded ? 'Expand step' : 'Collapse step');
        btn.querySelector('.product-bundle__step-toggle-icon').innerHTML = isExpanded ? 
          `<img src=${this.config.toggleIconDown} alt="Carrot Down Icon" width="12" height="12">` : 
          `<img src=${this.config.toggleIconUp} alt="Carrot Up Icon" width="12" height="12">`;
        });
    }

    setupQuantityListeners() {
      this.addEventListener('click', (e) => {
        const btn = e.target.closest('.bundle-product-card__qty-btn');
        if (!btn) return;

        const productId = btn.dataset.productId;
        const card = btn.closest('.bundle-product-card');
        const input = card?.querySelector('.bundle-product-card__qty-input');
        const currentVariantId = input?.dataset.variantId;
        if (!input | !productId | !currentVariantId) return;

        let targetVariantId = currentVariantId;
        let targetQty = 0;

        if (btn.name === 'plus') {
          const key = `${productId}-${currentVariantId}`;
          const existingItem = this.selectedItems.get(key);
          const existingQty = existingItem?.quantity ?? 0;
          targetQty = Math.min(99, existingQty + 1);
        } else if (btn.name === 'minus') {
          const currentKey = `${productId}-${currentVariantId}`;
          const currentItem = this.selectedItems.get(currentKey);

          if(currentItem && currentItem.quantity > 0 ) {
            targetQty = Math.max(0, currentItem.quantity - 1);
            targetVariantId = currentVariantId;
          } else {
            const productEntries = Array.from(this.selectedItems.entries()).filter(
              ([, item]) => String(item.productId) === String(productId)
            );

            if(productEntries.length === 0) {
              targetQty = 0;
              targetVariantId = currentVariantId;
            } else {
              const [, fallbackItem] = productEntries[productEntries.length -1];
              targetVariantId = fallbackItem.variantId;
              targetQty = Math.max(0, fallbackItem.quantity - 1);
            }
          }
        }

        this.updateItemQuantity(productId, targetVariantId, targetQty, card);

        const totalQty = this.getTotalProductQuantity(productId);
        input.value = String(totalQty);
        input.setAttribute('value', String(totalQty));
      });

      this.addEventListener('change', (e) => {
        const input = e.target;
        if (!input?.classList?.contains('bundle-product-card__qty-input')) return;
        const productId = input.dataset.productId;
        const variantId = input.dataset.variantId;
        const card = input.closest('.bundle-product-card');
        let qty = parseInt(input.value, 10) || 0;
        qty = Math.max(0, Math.min(99, qty));
        input.value = qty;
        input.setAttribute('value', String(qty));
        this.updateItemQuantity(productId, variantId, qty, card);
      });
    }

    setupVariantListeners() {
      this.addEventListener('click', (e) => {
        const btn = e.target.closest('.bundle-product-card__variant-btn');
        if (!btn) return;

        const productId = btn.dataset.productId;
        const variantId = btn.dataset.variantId;
        const card = btn.closest('.bundle-product-card');
        const priceDisplay = card?.querySelector('[data-price-display]');
        const qtyInput = card?.querySelector('.bundle-product-card__qty-input');
        const optionBtns = card?.querySelectorAll('.bundle-product-card__variant-btn');

        optionBtns?.forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));

        const price = parseInt(btn.dataset.price, 10);
        const compareAt = parseInt(btn.dataset.compareAtPrice, 10) || 0;

        if (priceDisplay) {
          let html = '';
          if (compareAt > price) {
            html += `<s class="bundle-product-card__compare-price">${this.formatMoney(compareAt)}</s> `;
          }
          html += `<span class="bundle-product-card__current-price">${this.formatMoney(price)}</span>`;
          priceDisplay.innerHTML = html;
        }

        if(qtyInput && productId && variantId) {
          const totalQty = this.getTotalProductQuantity(productId);
          qtyInput.value = String(totalQty);
          qtyInput.setAttribute('value', String(totalQty));
          qtyInput?.setAttribute('data-variant-id', variantId);
        }
        
      });
    }

    getProductData(card) {
      const script = card?.querySelector('[data-product-data]');
      if (!script?.textContent) return null;
      try {
        return JSON.parse(script.textContent);
      } catch {
        return null;
      }
    }

    updateItemQuantity(productId, variantId, qty, card) {
      const key = `${productId}-${variantId}`;
      const existing = this.selectedItems.get(key);
      const stepIndex = card ? parseInt(card.dataset.stepIndex ?? '-1', 10) : (existing?.stepIndex ?? -1);
      const stepTitle = card?.dataset.stepTitle ?? existing?.stepTitle ?? 'Step';

      if (qty <= 0) {
        this.selectedItems.delete(key);
      } else {
        const productData = card ? this.getProductData(card) : null;
        const variant = productData?.variants?.find((v) => String(v.id) === String(variantId));
        const price = variant?.price ?? 0;
        const compareAt = variant?.compare_at_price ?? 0;
        const title = productData?.title ?? 'Product';
        const variantTitle = variant?.title ?? '';
        const image = productData?.productImage || '';

        this.selectedItems.set(key, {
          productId,
          variantId,
          title,
          variantTitle,
          price,
          compareAtPrice: compareAt,
          quantity: qty,
          stepIndex,
          stepTitle,
          image
        });
      }
      this.syncAllQuantityInputs(productId, variantId, qty);
      this.updateCardSelectionStates();
      this.renderReview();
      this.updateStepCounts();
      requestAnimationFrame(() => {
        this.syncAllQuantityInputsByValue();
        this.updateCardSelectionStates();
      });
    }

    syncAllQuantityInputs(productId) {
      const totalQty = this.getTotalProductQuantity(productId);
      const inputs = this.querySelectorAll(
        `.bundle-product-card__qty-input[data-product-id="${productId}"]`
      );
      const qtyStr = String(totalQty);
      inputs.forEach((input) => {
        const current = parseInt(input.value, 10) || 0;
        if (current !== qtyStr) {
          input.value = qtyStr;
          input.setAttribute('value', qtyStr);
        }
      });
      this.syncAllQuantityInputsByValue();
    }

    syncAllQuantityInputsByValue() {
      this.querySelectorAll('.bundle-product-card__qty-input').forEach((input) => {
        const val = input.value;
        if (input.getAttribute('value') !== val) {
          input.setAttribute('value', val);
        }
      });
    }

    setupReviewListeners() {
      const reviewEl = this.querySelector('[data-review-items]');
      if (!reviewEl) return;

      reviewEl.addEventListener('click', (e) => {
        const minusBtn = e.target.closest('[data-review-item-minus]');
        if (!minusBtn) return;

        const productId = minusBtn.dataset.productId;
        const variantId = minusBtn.dataset.variantId;
        const key = `${productId}-${variantId}`;
        const item = this.selectedItems.get(key);
        if (!item) return;

        const newQty = Math.max(0, item.quantity - 1);
        const card = this.findProductCard(productId, variantId);
        if (card) {
          const input = card.querySelector('.bundle-product-card__qty-input');
          if (input) {
            input.value = newQty;
            input.setAttribute('value', String(newQty));
            input.setAttribute('data-variant-id', variantId);
          }
        }
        this.updateItemQuantity(productId, variantId, newQty, card);
      });

      reviewEl.addEventListener('click', (e) => {
        const plusBtn = e.target.closest('[data-review-item-plus]');
        if (!plusBtn) return;

        const productId = plusBtn.dataset.productId;
        const variantId = plusBtn.dataset.variantId;
        const key = `${productId}-${variantId}`;
        const item = this.selectedItems.get(key);
        const currentQty = item?.quantity ?? 0;
        const newQty = Math.min(99, currentQty + 1);
        const card = this.findProductCard(productId, variantId);
        if (card) {
          const input = card.querySelector('.bundle-product-card__qty-input');
          if (input) {
            input.value = newQty;
            input.setAttribute('value', String(newQty));
            input.setAttribute('data-variant-id', variantId);
          }
        }
        this.updateItemQuantity(productId, variantId, newQty, card);
      });
    }

    findProductCard(productId, variantId) {
      const cards = this.querySelectorAll(`.bundle-product-card[data-product-id="${productId}"]`);
      for (const card of cards) {
        const input = card.querySelector(`.bundle-product-card__qty-input[data-variant-id="${variantId}"]`);
        if (input) return card;
        const btn = card.querySelector(`.bundle-product-card__variant-btn[data-variant-id="${variantId}"]`);
        if (btn) return card;
      }
      return null;
    }

    renderReview() {
      const container = this.querySelector('[data-review-items]');
      const emptyEl = this.querySelector('[data-review-empty]');
      const summaryEl = this.querySelector('[data-review-summary]');
      if (!container) return;

      const items = Array.from(this.selectedItems.entries());
      
      let subtotal = 0;
      let compareTotal = 0;
      
      if (items.length === 0) {
        emptyEl?.classList.remove('hidden');
        summaryEl?.classList.add('hidden');
        container.querySelectorAll('.product-bundle__review-group, .product-bundle__review-item').forEach((el) => el.remove());
        return;
      }

      emptyEl?.classList.add('hidden');
      summaryEl?.classList.remove('hidden');

      container.querySelectorAll('.product-bundle__review-group, .product-bundle__review-item').forEach((el) => el.remove());

      const stepTitles = this.config?.stepTitles ?? [];
      const byStep = new Map();
      for (const [key, item] of items) {
        const stepKey = item.stepIndex >= 0 ? item.stepIndex : 999;
        const title = item.stepTitle || stepTitles[item.stepIndex] || `Step ${item.stepIndex + 1}`;
        if (!byStep.has(stepKey)) {
          byStep.set(stepKey, { title, items: [] });
        }
        byStep.get(stepKey).items.push([key, item]);
      }

      const sortedSteps = Array.from(byStep.entries()).sort((a, b) => a[0] - b[0]);

      for (const [stepKey, { title, items: stepItems }] of sortedSteps) {
        const groupEl = document.createElement('div');
        groupEl.className = 'product-bundle__review-group';
        groupEl.dataset.stepIndex = String(stepKey);
        groupEl.innerHTML = `<h4 class="product-bundle__review-group-title">${this.escapeHtml(title)}</h4>`;
        const itemsWrapper = document.createElement('div');
        itemsWrapper.className = 'product-bundle__review-group-items';

        for (const [key, item] of stepItems) {
          const lineTotal = item.price * item.quantity;
          subtotal += lineTotal;
          if (item.compareAtPrice > item.price) {
            compareTotal += item.compareAtPrice * item.quantity;
          } else {
            compareTotal += lineTotal;
          }

          const displayTitle = item.variantTitle ? `${item.title} - ${item.variantTitle}` : item.title;
          const div = document.createElement('div');
          div.className = 'product-bundle__review-item';
          div.dataset.productId = item.productId;
          div.dataset.variantId = item.variantId;
          div.innerHTML = `
            <div class="product-bundle__review-item-info">
            <img src=${item.image} alt=${item.title} width="40" height="40" />
              <span class="product-bundle__review-item-title">${this.escapeHtml(displayTitle)}</span>
            </div>
            
            <div class="product-bundle__review-item-actions-wrapper"> 
              <div class="product-bundle__review-item-actions">
                <button type="button" class="product-bundle__review-qty-btn" data-review-item-minus data-product-id="${item.productId}" data-variant-id="${item.variantId}" aria-label="Decrease quantity">−</button>
                <span class="product-bundle__review-item-qty">${item.quantity}</span>
                <button type="button" class="product-bundle__review-qty-btn" data-review-item-plus data-product-id="${item.productId}" data-variant-id="${item.variantId}" aria-label="Increase quantity">+</button>
              </div>
                <span class="product-bundle__review-item-meta">${this.formatMoney(item.price)}</span>
            </div>
          `;
          itemsWrapper.appendChild(div);
        }
        groupEl.appendChild(itemsWrapper);
        container.appendChild(groupEl);
      }

      const savings = compareTotal - subtotal;
      const totalEl = summaryEl?.querySelector('[data-total-value]');
      const originalEl = summaryEl?.querySelector('[data-original-total-value]');
      const savingsEl = summaryEl?.querySelector('[data-savings-value]');
      const savingsRow = summaryEl?.querySelector('[data-savings-row]');

      if (totalEl) totalEl.textContent = this.formatMoney(subtotal);
      if (originalEl) originalEl.textContent = this.formatMoney(compareTotal);
      if (savingsEl) savingsEl.textContent = this.formatMoney(savings);
      if (savingsRow) savingsRow.classList.toggle('hidden', savings <= 0);
    }

    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    setupNextStepLinks() {
      this.addEventListener('click', (e) => {
        const link = e.target.closest('[data-next-step]');
        if (!link) return;
        e.preventDefault();
        const stepIndex = parseInt(link.dataset.nextStep, 10);
        const steps = this.querySelectorAll('.product-bundle__step');
        const target = steps[stepIndex];
        if(!target) return;

        const targetPanel = target.querySelector('[data-products-panel]');
        const targetToggle = target.querySelector('[data-step-toggle]');

        if(targetPanel && targetToggle) {
          targetPanel.classList.remove('product-bundle__step--collapsed');
          target.classList.add('product-bundle__step--open');
          targetToggle.setAttribute('aria-expanded', 'true');
          targetToggle.setAttribute('aria-label', 'Collapse Step');

          const icon = targetToggle.querySelector('.product-bundle__step-toggle-icon'); 
          if(icon) icon.innerHTML = `<img src=${this.config.toggleIconUp} alt="Carrot Down Icon" width="12" height="12">`;
        }

        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  customElements.define('product-bundle', ProductBundle);
}