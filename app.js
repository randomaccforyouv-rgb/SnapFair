/* ================================================
   SplitSnap — Full Application Logic
   ================================================ */

class SplitSnap {
  constructor() {
    this.items = [];
    this.people = [];
    this.assignments = {};     // itemId -> Set of personIds
    this.tax = 0;
    this.tipPercent = 20;
    this.tipCustom = 0;
    this.tipMode = 'percent';  // 'percent' | 'custom'
    this.currentScreen = 'home';
    this.cameraStream = null;
    this.facingMode = 'environment';
    this.idCounter = 0;

    this.COLORS = [
      '#6C5CE7', '#00CEC9', '#E17055', '#00B894',
      '#FDCB6E', '#E84393', '#0984E3', '#D63031',
      '#6AB04C', '#F9CA24', '#30336B', '#22A6B3',
    ];

    this.init();
  }

  // ----- Utilities -----

  uid() { return '_' + (++this.idCounter) + '_' + Math.random().toString(36).slice(2, 8); }

  $(sel) { return document.querySelector(sel); }
  $$(sel) { return document.querySelectorAll(sel); }

  formatMoney(n) {
    return '$' + Math.abs(n).toFixed(2);
  }

  getInitials(name) {
    return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  getColor(index) {
    return this.COLORS[index % this.COLORS.length];
  }

  vibrate(ms = 10) {
    try { navigator.vibrate?.(ms); } catch {}
  }

  // ----- Toast -----

  toast(msg, duration = 2500) {
    const el = this.$('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ----- Screen Navigation -----

  showScreen(name, step = null) {
    this.$$('.screen').forEach(s => s.classList.remove('active'));
    const target = this.$(`#screen-${name}`);
    if (target) target.classList.add('active');
    this.currentScreen = name;

    const progress = this.$('#step-progress');
    if (step) {
      progress.classList.remove('hidden');
      this.$$('.dot').forEach(d => {
        const s = parseInt(d.dataset.step);
        d.classList.toggle('active', s === step);
        d.classList.toggle('done', s < step);
      });
    } else {
      progress.classList.add('hidden');
    }

    window.scrollTo(0, 0);
  }

  // ----- Initialization -----

  init() {
    // Check for shared split in URL
    if (this.loadSharedSplit()) return;

    // Screen: Home
    this.$('#btn-scan').addEventListener('click', () => this.openCamera());
    this.$('#btn-upload').addEventListener('click', () => this.$('#file-input').click());
    this.$('#btn-manual').addEventListener('click', () => this.startManual());
    this.$('#file-input').addEventListener('change', e => this.handleFileUpload(e));

    // Screen: Camera
    this.$('#btn-camera-back').addEventListener('click', () => this.closeCamera());
    this.$('#btn-capture').addEventListener('click', () => this.capturePhoto());
    this.$('#btn-flip-camera').addEventListener('click', () => this.flipCamera());

    // Screen: Items
    this.$('#btn-add-item').addEventListener('click', () => this.showAddItemModal());
    this.$('#btn-save-item').addEventListener('click', () => this.saveNewItem());
    this.$('#btn-cancel-item').addEventListener('click', () => this.hideAddItemModal());
    this.$('#btn-items-back').addEventListener('click', () => this.showScreen('home'));
    this.$('#btn-items-next').addEventListener('click', () => {
      if (this.items.length === 0) { this.toast('Add at least one item'); return; }
      this.renderPeople();
      this.showScreen('people', 2);
    });

    // Enter key in new item modal
    this.$('#new-item-price').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.saveNewItem();
    });
    this.$('#new-item-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.$('#new-item-price').focus();
    });

    // Screen: People
    this.$('#btn-add-person').addEventListener('click', () => this.addPersonFromInput());
    this.$('#person-name-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.addPersonFromInput();
    });
    this.$('#btn-people-back').addEventListener('click', () => {
      this.renderItems();
      this.showScreen('items', 1);
    });
    this.$('#btn-people-next').addEventListener('click', () => {
      if (this.people.length < 2) { this.toast('Add at least 2 people'); return; }
      this.saveGroupToStorage();
      this.initAssignments();
      this.renderAssignments();
      this.showScreen('assign', 3);
    });

    // Screen: Assign
    this.$('#btn-assign-back').addEventListener('click', () => {
      this.renderPeople();
      this.showScreen('people', 2);
    });
    this.$('#btn-assign-next').addEventListener('click', () => {
      if (!this.validateAssignments()) return;
      this.renderSummary();
      this.showScreen('summary', 4);
    });

    // Screen: Summary
    this.$('#tax-input').addEventListener('input', () => {
      this.tax = parseFloat(this.$('#tax-input').value) || 0;
      this.renderSummaryTotals();
    });

    this.$$('.tip-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleTipBtn(btn));
    });

    this.$('#custom-tip-input').addEventListener('input', () => {
      this.tipCustom = parseFloat(this.$('#custom-tip-input').value) || 0;
      this.renderSummaryTotals();
    });

    // Payment handles — save to localStorage
    ['venmo-handle', 'paypal-handle', 'cashapp-handle'].forEach(id => {
      const el = this.$(`#${id}`);
      el.value = localStorage.getItem(`splitsnap_${id}`) || '';
      el.addEventListener('input', () => {
        localStorage.setItem(`splitsnap_${id}`, el.value.trim());
        this.renderSummaryTotals();
      });
    });

    this.$('#btn-share').addEventListener('click', () => this.shareSplit());
    this.$('#btn-copy-summary').addEventListener('click', () => this.copySummary());
    this.$('#btn-new-split').addEventListener('click', () => this.resetApp());

    // Shared screen
    this.$('#btn-shared-new')?.addEventListener('click', () => {
      window.location.hash = '';
      this.resetApp();
    });

    // Quick add names from saved groups
    this.renderQuickAdd();

    // Register service worker
    this.registerSW();
  }

  // ----- Camera -----

  async openCamera() {
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      this.$('#camera-feed').srcObject = this.cameraStream;
      this.showScreen('camera');
    } catch (err) {
      console.warn('Camera error:', err);
      this.toast('Camera unavailable — try uploading a photo');
      this.$('#file-input').click();
    }
  }

  closeCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    this.$('#camera-feed').srcObject = null;
    this.showScreen('home');
  }

  async flipCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
    }
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      this.$('#camera-feed').srcObject = this.cameraStream;
    } catch {
      this.toast('Could not switch camera');
    }
  }

  capturePhoto() {
    this.vibrate(15);
    const video = this.$('#camera-feed');
    const canvas = this.$('#capture-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    this.closeCamera();
    const preprocessed = this.preprocessImage(canvas);
    this.processImage(preprocessed);
  }

  // ----- File Upload -----

  handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const preprocessed = this.preprocessImage(canvas);
        this.processImage(preprocessed);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ----- Image Preprocessing -----

  preprocessImage(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {
      // Luminance grayscale
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

      // Contrast stretch
      const contrast = 1.6;
      const mid = 128;
      const val = Math.min(255, Math.max(0, (gray - mid) * contrast + mid));

      d[i] = d[i + 1] = d[i + 2] = val;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // ----- OCR Processing -----

  async processImage(canvas) {
    this.showScreen('processing');
    const statusEl = this.$('#ocr-status');
    const progressEl = this.$('#ocr-progress');
    const detailEl = this.$('#ocr-detail');

    statusEl.textContent = 'Loading OCR engine…';
    progressEl.style.width = '0%';

    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'loading tesseract core') {
            statusEl.textContent = 'Loading OCR engine…';
            progressEl.style.width = '10%';
          } else if (m.status === 'initializing tesseract') {
            statusEl.textContent = 'Initializing…';
            progressEl.style.width = '20%';
          } else if (m.status === 'loading language traineddata') {
            statusEl.textContent = 'Loading language data…';
            detailEl.textContent = 'First time may take a moment';
            progressEl.style.width = '30%';
          } else if (m.status === 'initializing api') {
            statusEl.textContent = 'Almost ready…';
            progressEl.style.width = '50%';
          } else if (m.status === 'recognizing text') {
            statusEl.textContent = 'Reading your receipt…';
            detailEl.textContent = `${Math.round(m.progress * 100)}% complete`;
            progressEl.style.width = `${50 + m.progress * 50}%`;
          }
        }
      });

      const { data: { text } } = await worker.recognize(canvas);
      await worker.terminate();

      console.log('OCR Raw Text:\n', text);

      const parsed = this.parseReceipt(text);
      this.items = parsed.items;
      this.tax = parsed.tax;

      if (this.items.length === 0) {
        this.toast('No items found — try manual entry');
        this.startManual();
        return;
      }

      this.$('#tax-input').value = this.tax.toFixed(2);
      this.renderItems();
      this.showScreen('items', 1);
      this.toast(`Found ${this.items.length} items!`);

    } catch (err) {
      console.error('OCR Error:', err);
      this.toast('OCR failed — entering manual mode');
      this.startManual();
    }
  }

  // ----- Receipt Parser -----

  parseReceipt(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let detectedTax = 0;

    // Regex: find dollar amounts like 5.99, $5.99, $ 5.99
    const priceRegex = /\$?\s*(\d{1,4}\.\d{2})\b/g;

    const skipWords = [
      'subtotal', 'sub total', 'total', 'balance', 'amount due',
      'cash', 'credit', 'debit', 'visa', 'mastercard', 'amex',
      'change', 'payment', 'tender', 'thank', 'welcome', 'guest',
      'server', 'table', 'check', 'order', 'date', 'time',
      'receipt', 'tel', 'phone', 'fax', 'www', 'http',
      'discount', 'promo', 'coupon', 'reward'
    ];

    const taxWords = ['tax', 'hst', 'gst', 'pst', 'vat', 'sales tax'];
    const tipWords = ['tip', 'gratuity', 'service charge'];

    for (const line of lines) {
      const lower = line.toLowerCase();

      // Skip very short lines or lines with no letters
      if (line.length < 3) continue;
      if (!/[a-zA-Z]/.test(line)) continue;

      // Find all prices on this line
      const prices = [];
      let match;
      const regex = /\$?\s*(\d{1,4}\.\d{2})\b/g;
      while ((match = regex.exec(line)) !== null) {
        prices.push({ value: parseFloat(match[1]), index: match.index });
      }

      if (prices.length === 0) continue;

      // Use the LAST price on the line (usually the line total)
      const price = prices[prices.length - 1];

      // Get item name (text before the price area)
      let name = line.substring(0, prices[0].index).trim();
      // Clean up common OCR artifacts
      name = name.replace(/^[\d\s.#*\-]+/, '').replace(/[._*]+$/, '').trim();

      // Check for tax
      if (taxWords.some(tw => lower.includes(tw))) {
        detectedTax = price.value;
        continue;
      }

      // Check for tip (skip)
      if (tipWords.some(tw => lower.includes(tw))) continue;

      // Skip non-item lines
      if (skipWords.some(sw => lower.includes(sw))) continue;

      // Skip if price seems too high (likely a total) — heuristic
      if (price.value > 200) continue;

      // Skip if no meaningful name
      if (name.length < 2) {
        // Try using text after price
        const afterPrice = line.substring(prices[prices.length - 1].index + prices[prices.length - 1].value.toString().length + 1).trim();
        if (afterPrice.length >= 2) {
          name = afterPrice;
        } else {
          continue;
        }
      }

      if (price.value > 0 && price.value < 200) {
        items.push({
          id: this.uid(),
          name: this.titleCase(name),
          price: price.value
        });
      }
    }

    // Simple dedup: if last item price equals sum of others, it's probably a total
    if (items.length > 1) {
      const last = items[items.length - 1];
      const sumOthers = items.slice(0, -1).reduce((s, i) => s + i.price, 0);
      if (Math.abs(last.price - sumOthers) < 0.02) {
        items.pop();
      }
    }

    return { items, tax: detectedTax };
  }

  titleCase(str) {
    return str.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }

  // ----- Manual Entry -----

  startManual() {
    this.items = [];
    this.renderItems();
    this.showScreen('items', 1);
    this.showAddItemModal();
  }

  // ----- Items Management -----

  renderItems() {
    const list = this.$('#items-list');

    if (this.items.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <p>No items yet. Add your first item!</p>
        </div>`;
      return;
    }

    list.innerHTML = this.items.map(item => `
      <div class="item-card" data-id="${item.id}">
        <input class="item-name" value="${this.escapeHtml(item.name)}" 
               data-id="${item.id}" data-field="name" aria-label="Item name">
        <input class="item-price" type="number" step="0.01" min="0" 
               value="${item.price.toFixed(2)}" 
               data-id="${item.id}" data-field="price" aria-label="Price">
        <button class="item-delete" data-id="${item.id}" aria-label="Remove">✕</button>
      </div>
    `).join('');

    // Event listeners
    list.querySelectorAll('.item-name').forEach(el => {
      el.addEventListener('change', e => this.updateItem(e.target.dataset.id, 'name', e.target.value));
    });
    list.querySelectorAll('.item-price').forEach(el => {
      el.addEventListener('change', e => this.updateItem(e.target.dataset.id, 'price', parseFloat(e.target.value) || 0));
    });
    list.querySelectorAll('.item-delete').forEach(el => {
      el.addEventListener('click', e => this.removeItem(e.currentTarget.dataset.id));
    });
  }

  updateItem(id, field, value) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (field === 'name') item.name = value;
    if (field === 'price') item.price = value;
  }

  removeItem(id) {
    this.vibrate(10);
    this.items = this.items.filter(i => i.id !== id);
    delete this.assignments[id];
    this.renderItems();
    this.toast('Item removed');
  }

  showAddItemModal() {
    this.$('#add-item-modal').classList.remove('hidden');
    this.$('#new-item-name').value = '';
    this.$('#new-item-price').value = '';
    setTimeout(() => this.$('#new-item-name').focus(), 100);
  }

  hideAddItemModal() {
    this.$('#add-item-modal').classList.add('hidden');
  }

  saveNewItem() {
    const name = this.$('#new-item-name').value.trim();
    const price = parseFloat(this.$('#new-item-price').value);

    if (!name) { this.toast('Enter item name'); return; }
    if (isNaN(price) || price <= 0) { this.toast('Enter a valid price'); return; }

    this.items.push({ id: this.uid(), name, price });
    this.vibrate(10);
    this.hideAddItemModal();
    this.renderItems();
    this.toast('Item added');
  }

  // ----- People Management -----

  renderPeople() {
    const list = this.$('#people-list');

    if (this.people.length === 0) {
      list.innerHTML = '';
    } else {
      list.innerHTML = this.people.map((p, i) => `
        <div class="person-chip" data-id="${p.id}">
          <div class="person-avatar" style="background:${this.getColor(i)}">
            ${this.getInitials(p.name)}
          </div>
          <span>${this.escapeHtml(p.name)}</span>
          <button class="person-remove" data-id="${p.id}" aria-label="Remove">✕</button>
        </div>
      `).join('');

      list.querySelectorAll('.person-remove').forEach(el => {
        el.addEventListener('click', e => this.removePerson(e.currentTarget.dataset.id));
      });
    }

    this.$('#btn-people-next').disabled = this.people.length < 2;
  }

  addPersonFromInput() {
    const input = this.$('#person-name-input');
    const name = input.value.trim();
    if (!name) return;

    // Check for duplicate
    if (this.people.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      this.toast('Already added!');
      return;
    }

    this.people.push({ id: this.uid(), name });
    this.vibrate(10);
    input.value = '';
    input.focus();
    this.renderPeople();
    this.renderQuickAdd();
  }

  removePerson(id) {
    this.vibrate(10);
    this.people = this.people.filter(p => p.id !== id);
    // Clean assignments
    for (const itemId in this.assignments) {
      this.assignments[itemId].delete(id);
    }
    this.renderPeople();
    this.renderQuickAdd();
  }

  // ----- Quick Add / Saved Groups -----

  saveGroupToStorage() {
    if (this.people.length < 2) return;
    const names = this.people.map(p => p.name);
    const saved = JSON.parse(localStorage.getItem('splitsnap_names') || '[]');
    for (const n of names) {
      if (!saved.includes(n)) saved.push(n);
    }
    // Keep last 20
    localStorage.setItem('splitsnap_names', JSON.stringify(saved.slice(-20)));
  }

  renderQuickAdd() {
    const saved = JSON.parse(localStorage.getItem('splitsnap_names') || '[]');
    const currentNames = new Set(this.people.map(p => p.name.toLowerCase()));
    const available = saved.filter(n => !currentNames.has(n.toLowerCase()));

    const container = this.$('#quick-chips');
    if (!container) return;

    if (available.length === 0) {
      this.$('#quick-add').classList.add('hidden');
      return;
    }

    this.$('#quick-add').classList.remove('hidden');
    container.innerHTML = available.map(n => `
      <button class="quick-chip" data-name="${this.escapeHtml(n)}">${this.escapeHtml(n)}</button>
    `).join('');

    container.querySelectorAll('.quick-chip').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.name;
        this.people.push({ id: this.uid(), name });
        this.vibrate(10);
        this.renderPeople();
        this.renderQuickAdd();
      });
    });
  }

  // ----- Assignments -----

  initAssignments() {
    for (const item of this.items) {
      if (!this.assignments[item.id]) {
        this.assignments[item.id] = new Set();
      }
    }
  }

  renderAssignments() {
    const list = this.$('#assign-list');

    list.innerHTML = this.items.map(item => {
      const assigned = this.assignments[item.id] || new Set();
      const allAssigned = assigned.size === this.people.length;

      return `
        <div class="assign-card" data-item-id="${item.id}">
          <div class="assign-card-header">
            <span class="name">${this.escapeHtml(item.name)}</span>
            <span class="price">${this.formatMoney(item.price)}</span>
          </div>
          <div class="assign-people">
            ${this.people.map((p, i) => `
              <button class="assign-person-btn ${assigned.has(p.id) ? 'assigned' : ''}" 
                      data-item-id="${item.id}" data-person-id="${p.id}">
                <span class="mini-avatar" style="background:${this.getColor(i)}">
                  ${this.getInitials(p.name)}
                </span>
                ${this.escapeHtml(p.name)}
              </button>
            `).join('')}
            <button class="assign-everyone ${allAssigned ? 'all-assigned' : ''}" 
                    data-item-id="${item.id}">
              ${allAssigned ? '✓ Everyone' : 'Everyone'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Listeners
    list.querySelectorAll('.assign-person-btn').forEach(el => {
      el.addEventListener('click', () => {
        this.vibrate(5);
        this.toggleAssignment(el.dataset.itemId, el.dataset.personId);
      });
    });

    list.querySelectorAll('.assign-everyone').forEach(el => {
      el.addEventListener('click', () => {
        this.vibrate(5);
        this.assignEveryone(el.dataset.itemId);
      });
    });
  }

  toggleAssignment(itemId, personId) {
    if (!this.assignments[itemId]) this.assignments[itemId] = new Set();
    const set = this.assignments[itemId];
    if (set.has(personId)) {
      set.delete(personId);
    } else {
      set.add(personId);
    }
    this.renderAssignments();
  }

  assignEveryone(itemId) {
    if (!this.assignments[itemId]) this.assignments[itemId] = new Set();
    const set = this.assignments[itemId];
    if (set.size === this.people.length) {
      set.clear();
    } else {
      this.people.forEach(p => set.add(p.id));
    }
    this.renderAssignments();
  }

  validateAssignments() {
    const unassigned = this.items.filter(item => {
      const a = this.assignments[item.id];
      return !a || a.size === 0;
    });
    if (unassigned.length > 0) {
      this.toast(`Assign "${unassigned[0].name}" to someone`);
      return false;
    }
    return true;
  }

  // ----- Calculations -----

  getSubtotal() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }

  getTipAmount() {
    if (this.tipMode === 'custom') return this.tipCustom;
    return this.getSubtotal() * (this.tipPercent / 100);
  }

  getPersonBreakdown(personId) {
    const items = [];
    let subtotal = 0;

    for (const item of this.items) {
      const assigned = this.assignments[item.id];
      if (assigned && assigned.has(personId)) {
        const share = item.price / assigned.size;
        items.push({
          name: item.name,
          fullPrice: item.price,
          share: share,
          sharedWith: assigned.size
        });
        subtotal += share;
      }
    }

    const totalSubtotal = this.getSubtotal();
    const proportion = totalSubtotal > 0 ? subtotal / totalSubtotal : 0;
    const taxShare = this.tax * proportion;
    const tipShare = this.getTipAmount() * proportion;
    const total = subtotal + taxShare + tipShare;

    return { items, subtotal, taxShare, tipShare, total, proportion };
  }

  // ----- Summary Rendering -----

  renderSummary() {
    this.$('#tax-input').value = this.tax.toFixed(2);
    this.renderSummaryTotals();
  }

  renderSummaryTotals() {
    this.tax = parseFloat(this.$('#tax-input').value) || 0;

    const summaryList = this.$('#summary-list');
    const venmoHandle = this.$('#venmo-handle').value.trim();
    const paypalHandle = this.$('#paypal-handle').value.trim();
    const cashappHandle = this.$('#cashapp-handle').value.trim();

    let html = '';

    this.people.forEach((person, index) => {
      const breakdown = this.getPersonBreakdown(person.id);
      const note = encodeURIComponent(`SplitSnap: Dinner split`);

      let payLinksHtml = '';
      if (venmoHandle || paypalHandle || cashappHandle) {
        payLinksHtml = '<div class="summary-pay-links">';
        if (venmoHandle) {
          payLinksHtml += `<a href="https://venmo.com/${venmoHandle}?txn=charge&amount=${breakdown.total.toFixed(2)}&note=${note}" 
                            target="_blank" class="pay-link venmo">Venmo ${this.formatMoney(breakdown.total)}</a>`;
        }
        if (paypalHandle) {
          payLinksHtml += `<a href="https://paypal.me/${paypalHandle}/${breakdown.total.toFixed(2)}" 
                            target="_blank" class="pay-link paypal">PayPal ${this.formatMoney(breakdown.total)}</a>`;
        }
        if (cashappHandle) {
          payLinksHtml += `<a href="https://cash.app/$${cashappHandle}/${breakdown.total.toFixed(2)}" 
                            target="_blank" class="pay-link cashapp">Cash App ${this.formatMoney(breakdown.total)}</a>`;
        }
        payLinksHtml += '</div>';
      }

      html += `
        <div class="summary-card">
          <div class="summary-card-header">
            <div class="summary-person-info">
              <div class="person-avatar" style="background:${this.getColor(index)}">
                ${this.getInitials(person.name)}
              </div>
              <span class="summary-person-name">${this.escapeHtml(person.name)}</span>
            </div>
            <span class="summary-person-total">${this.formatMoney(breakdown.total)}</span>
          </div>
          <div class="summary-card-details">
            ${breakdown.items.map(item => `
              <div class="summary-item-row">
                <span>${this.escapeHtml(item.name)}${item.sharedWith > 1 ? ` (÷${item.sharedWith})` : ''}</span>
                <span>${this.formatMoney(item.share)}</span>
              </div>
            `).join('')}
            ${this.tax > 0 ? `
              <div class="summary-item-row tax-row">
                <span>Tax</span>
                <span>${this.formatMoney(breakdown.taxShare)}</span>
              </div>
            ` : ''}
            ${this.getTipAmount() > 0 ? `
              <div class="summary-item-row tip-row">
                <span>Tip</span>
                <span>${this.formatMoney(breakdown.tipShare)}</span>
              </div>
            ` : ''}
          </div>
          ${payLinksHtml}
        </div>
      `;
    });

    summaryList.innerHTML = html;

    // Totals check
    const subtotal = this.getSubtotal();
    const tipAmount = this.getTipAmount();
    const grandTotal = subtotal + this.tax + tipAmount;

    this.$('#check-subtotal').textContent = this.formatMoney(subtotal);
    this.$('#check-tax').textContent = this.formatMoney(this.tax);
    this.$('#check-tip').textContent = this.formatMoney(tipAmount);
    this.$('#check-total').textContent = this.formatMoney(grandTotal);
  }

  handleTipBtn(btn) {
    this.vibrate(5);
    this.$$('.tip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const val = btn.dataset.tip;
    if (val === 'custom') {
      this.tipMode = 'custom';
      this.$('#custom-tip-row').classList.remove('hidden');
      this.$('#custom-tip-input').focus();
    } else {
      this.tipMode = 'percent';
      this.tipPercent = parseInt(val);
      this.$('#custom-tip-row').classList.add('hidden');
    }

    this.renderSummaryTotals();
  }

  // ----- Share & Copy -----

  async shareSplit() {
    const text = this.buildSummaryText();
    const shareData = this.buildShareableData();

    // Try Web Share API first
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SplitSnap — Bill Split',
          text: text,
          url: shareData.url
        });
        this.toast('Shared!');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: copy link
    try {
      await navigator.clipboard.writeText(shareData.url + '\n\n' + text);
      this.toast('Link & summary copied!');
    } catch {
      this.toast('Could not share');
    }
  }

  async copySummary() {
    const text = this.buildSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Summary copied!');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.toast('Summary copied!');
    }
  }

  buildSummaryText() {
    const subtotal = this.getSubtotal();
    const tipAmount = this.getTipAmount();
    const lines = ['🧾 SplitSnap — Bill Split\n'];

    this.people.forEach(person => {
      const bd = this.getPersonBreakdown(person.id);
      lines.push(`${person.name}: ${this.formatMoney(bd.total)}`);
      bd.items.forEach(item => {
        const shared = item.sharedWith > 1 ? ` (÷${item.sharedWith})` : '';
        lines.push(`  • ${item.name}${shared}: ${this.formatMoney(item.share)}`);
      });
      if (bd.taxShare > 0) lines.push(`  • Tax: ${this.formatMoney(bd.taxShare)}`);
      if (bd.tipShare > 0) lines.push(`  • Tip: ${this.formatMoney(bd.tipShare)}`);
      lines.push('');
    });

    lines.push(`Total: ${this.formatMoney(subtotal + this.tax + tipAmount)}`);
    return lines.join('\n');
  }

  buildShareableData() {
    const data = {
      i: this.items.map(item => ({
        n: item.name,
        p: item.price,
        a: Array.from(this.assignments[item.id] || [])
      })),
      p: this.people.map(p => ({ id: p.id, n: p.name })),
      t: this.tax,
      tp: this.tipMode === 'custom' ? this.tipCustom : this.tipPercent,
      tm: this.tipMode
    };

    try {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      return { url: `${window.location.origin}${window.location.pathname}#split=${encoded}` };
    } catch {
      return { url: window.location.href };
    }
  }

  loadSharedSplit() {
    const hash = window.location.hash;
    if (!hash.startsWith('#split=')) return false;

    try {
      const encoded = hash.slice(7);
      const json = decodeURIComponent(escape(atob(encoded)));
      const data = JSON.parse(json);

      // Reconstruct state
      this.people = data.p.map(p => ({ id: p.id, name: p.n }));

      this.items = data.i.map((item, idx) => {
        const id = this.uid();
        return { id, name: item.n, price: item.p, _assignees: item.a };
      });

      // Build assignment map — need to map old person IDs
      this.assignments = {};
      this.items.forEach((item, idx) => {
        const original = data.i[idx];
        this.assignments[item.id] = new Set(original.a);
      });

      this.tax = data.t || 0;
      this.tipMode = data.tm || 'percent';
      if (this.tipMode === 'custom') {
        this.tipCustom = data.tp || 0;
      } else {
        this.tipPercent = data.tp || 20;
      }

      // Render shared view
      this.renderSharedView();
      this.showScreen('shared');
      return true;
    } catch (err) {
      console.error('Failed to load shared split:', err);
      return false;
    }
  }

  renderSharedView() {
    const summaryEl = this.$('#shared-summary');
    const totalsEl = this.$('#shared-totals');

    let html = '';
    this.people.forEach((person, index) => {
      const breakdown = this.getPersonBreakdown(person.id);
      html += `
        <div class="summary-card">
          <div class="summary-card-header">
            <div class="summary-person-info">
              <div class="person-avatar" style="background:${this.getColor(index)}">
                ${this.getInitials(person.name)}
              </div>
              <span class="summary-person-name">${this.escapeHtml(person.name)}</span>
            </div>
            <span class="summary-person-total">${this.formatMoney(breakdown.total)}</span>
          </div>
          <div class="summary-card-details">
            ${breakdown.items.map(item => `
              <div class="summary-item-row">
                <span>${this.escapeHtml(item.name)}${item.sharedWith > 1 ? ` (÷${item.sharedWith})` : ''}</span>
                <span>${this.formatMoney(item.share)}</span>
              </div>
            `).join('')}
            ${breakdown.taxShare > 0 ? `
              <div class="summary-item-row tax-row"><span>Tax</span><span>${this.formatMoney(breakdown.taxShare)}</span></div>
            ` : ''}
            ${breakdown.tipShare > 0 ? `
              <div class="summary-item-row tip-row"><span>Tip</span><span>${this.formatMoney(breakdown.tipShare)}</span></div>
            ` : ''}
          </div>
        </div>
      `;
    });

    summaryEl.innerHTML = html;

    const subtotal = this.getSubtotal();
    const tipAmount = this.getTipAmount();
    totalsEl.innerHTML = `
      <div class="totals-row"><span>Subtotal</span><span>${this.formatMoney(subtotal)}</span></div>
      <div class="totals-row"><span>Tax</span><span>${this.formatMoney(this.tax)}</span></div>
      <div class="totals-row"><span>Tip</span><span>${this.formatMoney(tipAmount)}</span></div>
      <div class="totals-row total"><span>Total</span><span>${this.formatMoney(subtotal + this.tax + tipAmount)}</span></div>
    `;
  }

  // ----- Reset -----

  resetApp() {
    this.items = [];
    this.people = [];
    this.assignments = {};
    this.tax = 0;
    this.tipPercent = 20;
    this.tipCustom = 0;
    this.tipMode = 'percent';
    window.location.hash = '';
    this.showScreen('home');
  }

  // ----- Helpers -----

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ----- PWA -----

  async registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (err) {
        console.log('SW registration failed:', err);
      }
    }
  }
}

// ----- Launch -----
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SplitSnap();
});