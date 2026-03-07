/* ================================================
   SnapFair — Complete App
   Fixed OCR + QR Escrow + Optimized
   ================================================ */

class SnapFair {
  constructor() {
    this.items = [];
    this.people = [];
    this.assignments = {};
    this.tax = 0;
    this.tipPercent = 0;
    this.tipCustom = 0;
    this.tipMode = 'percent';
    this.currentScreen = 'home';
    this.currentStep = 0;
    this.cameraStream = null;
    this.facingMode = 'environment';
    this.idCounter = 0;
    this.escrowTokens = {};

    this.COLORS = [
      '#059669','#3B82F6','#E17055','#22C55E',
      '#F59E0B','#E84393','#0EA5E9','#EF4444',
      '#6AB04C','#F9CA24','#30336B','#22A6B3',
    ];

    this.init();
  }

  // ═══════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════

  uid() { return '_' + (++this.idCounter) + '_' + Math.random().toString(36).slice(2, 8); }
  $(sel) { return document.querySelector(sel); }
  $$(sel) { return document.querySelectorAll(sel); }
  formatMoney(n) { return '$' + Math.abs(n).toFixed(2); }
  getInitials(name) { return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2); }
  getColor(i) { return this.COLORS[i % this.COLORS.length]; }
  vibrate(ms = 10) { try { navigator.vibrate?.(ms); } catch {} }

  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  titleCase(str) {
    return str.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }

  // ═══════════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════════

  toast(msg, type = 'default', duration = 2500) {
    const el = this.$('#toast');
    el.textContent = msg;
    el.className = 'toast' + (type !== 'default' ? ' toast-' + type : '');
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ═══════════════════════════════════════
  //  SCREEN NAVIGATION
  // ═══════════════════════════════════════

  showScreen(name, step = null) {
    this.$$('.screen').forEach(s => s.classList.remove('active'));
    const target = this.$(`#screen-${name}`);
    if (target) target.classList.add('active');
    this.currentScreen = name;

    const progress = this.$('#step-progress');
    if (step) {
      this.currentStep = step;
      progress.classList.remove('hidden');
      this.updateStepDots(step);
    } else {
      this.currentStep = 0;
      progress.classList.add('hidden');
    }
    window.scrollTo(0, 0);
  }

  updateStepDots(step) {
    this.$$('.dot').forEach(d => {
      const s = parseInt(d.dataset.step);
      d.classList.remove('active', 'done');
      if (s === step) d.classList.add('active');
      else if (s < step) d.classList.add('done');
    });
    this.$$('.dot-connector').forEach(c => {
      c.classList.toggle('done', parseInt(c.dataset.after) < step);
    });
  }

  handleDotClick(targetStep) {
    if (targetStep >= this.currentStep || targetStep < 1 || targetStep > 4) return;
    this.vibrate(5);
    switch (targetStep) {
      case 1: this.renderItems(); this.showScreen('items', 1); break;
      case 2:
        if (!this.items.length) { this.toast('Add items first', 'warning'); return; }
        this.renderPeople(); this.showScreen('people', 2); break;
      case 3:
        if (this.people.length < 2) { this.toast('Add people first', 'warning'); return; }
        this.initAssignments(); this.renderAssignments(); this.showScreen('assign', 3); break;
      case 4:
        if (!this.validateAssignments()) return;
        this.renderSummary(); this.showScreen('summary', 4); break;
    }
  }

  // ═══════════════════════════════════════
  //  INIT — WIRE UP ALL EVENTS
  // ═══════════════════════════════════════

  init() {
    // Check URL hash for shared data
    if (this.loadPaymentRequest()) return;
    if (this.loadSharedSplit()) return;

    // Step dots
    this.$$('.dot').forEach(dot => {
      dot.addEventListener('click', () => this.handleDotClick(parseInt(dot.dataset.step)));
    });

    // Home
    this.$('#btn-scan').addEventListener('click', () => this.openCamera());
    this.$('#btn-upload').addEventListener('click', () => this.$('#file-input').click());
    this.$('#btn-manual').addEventListener('click', () => this.startManual());
    this.$('#file-input').addEventListener('change', e => this.handleFileUpload(e));

    // Camera
    this.$('#btn-camera-back').addEventListener('click', () => this.closeCamera());
    this.$('#btn-capture').addEventListener('click', () => this.capturePhoto());
    this.$('#btn-flip-camera').addEventListener('click', () => this.flipCamera());

    // Items
    this.$('#btn-add-item').addEventListener('click', () => this.showAddItemModal());
    this.$('#btn-save-item').addEventListener('click', () => this.saveNewItem());
    this.$('#btn-cancel-item').addEventListener('click', () => this.hideAddItemModal());
    this.$('#btn-items-back').addEventListener('click', () => this.showScreen('home'));
    this.$('#btn-items-next').addEventListener('click', () => {
      if (!this.items.length) { this.toast('Add at least one item', 'warning'); return; }
      this.renderPeople(); this.showScreen('people', 2);
    });
    this.$('#new-item-price').addEventListener('keydown', e => { if (e.key === 'Enter') this.saveNewItem(); });
    this.$('#new-item-name').addEventListener('keydown', e => { if (e.key === 'Enter') this.$('#new-item-price').focus(); });

    // People
    this.$('#btn-add-person').addEventListener('click', () => this.addPersonFromInput());
    this.$('#person-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') this.addPersonFromInput(); });
    this.$('#btn-people-back').addEventListener('click', () => { this.renderItems(); this.showScreen('items', 1); });
    this.$('#btn-people-next').addEventListener('click', () => {
      if (this.people.length < 2) { this.toast('Add at least 2 people', 'warning'); return; }
      this.saveGroupToStorage();
      this.initAssignments();
      this.renderAssignments();
      this.showScreen('assign', 3);
    });

    // Assign
    this.$('#btn-assign-back').addEventListener('click', () => { this.renderPeople(); this.showScreen('people', 2); });
    this.$('#btn-assign-next').addEventListener('click', () => {
      if (!this.validateAssignments()) return;
      this.renderSummary(); this.showScreen('summary', 4);
    });

    // Summary
    this.$('#btn-summary-back').addEventListener('click', () => { this.renderAssignments(); this.showScreen('assign', 3); });
    this.$('#tax-input').addEventListener('input', () => {
      this.tax = parseFloat(this.$('#tax-input').value) || 0;
      this.renderSummaryTotals();
    });
    this.$$('.tip-btn').forEach(btn => btn.addEventListener('click', () => this.handleTipBtn(btn)));
    this.$('#custom-tip-input').addEventListener('input', () => {
      this.tipCustom = parseFloat(this.$('#custom-tip-input').value) || 0;
      this.renderSummaryTotals();
    });

    // Payment handles — persist to localStorage
    const handleIds = ['paypal-handle','wise-handle','revolut-handle','venmo-handle','cashapp-handle','bank-name-handle','bank-iban-handle'];
    handleIds.forEach(id => {
      const el = this.$(`#${id}`);
      if (!el) return;
      el.value = localStorage.getItem(`snapfair_${id}`) || '';
      el.addEventListener('input', () => {
        localStorage.setItem(`snapfair_${id}`, el.value.trim());
        this.renderSummaryTotals();
      });
    });

    this.$('#btn-share').addEventListener('click', () => this.shareSplit());
    this.$('#btn-copy-summary').addEventListener('click', () => this.copySummary());
    this.$('#btn-new-split').addEventListener('click', () => this.resetApp());

    // Shared view
    this.$('#btn-shared-new')?.addEventListener('click', () => { window.location.hash = ''; this.resetApp(); });

    // Payment request view
    this.$('#btn-payreq-new')?.addEventListener('click', () => { window.location.hash = ''; this.resetApp(); });

    this.renderQuickAdd();
    this.registerSW();
  }

  // ═══════════════════════════════════════
  //  CAMERA  (4K + autofocus)
  // ═══════════════════════════════════════

  async openCamera() {
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          focusMode: { ideal: 'continuous' },
          whiteBalanceMode: { ideal: 'continuous' },
          exposureMode: { ideal: 'continuous' },
        },
        audio: false
      });
      const video = this.$('#camera-feed');
      video.srcObject = this.cameraStream;
      await video.play();
      this.showScreen('camera');
      console.log(`Camera: ${video.videoWidth}x${video.videoHeight}`);
    } catch (err) {
      console.warn('Camera error:', err);
      this.toast('📷 Camera not available — try uploading', 'error');
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
    if (this.cameraStream) this.cameraStream.getTracks().forEach(t => t.stop());
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false
      });
      this.$('#camera-feed').srcObject = this.cameraStream;
    } catch { this.toast('Could not switch camera', 'error'); }
  }

  capturePhoto() {
    this.vibrate(15);
    const video = this.$('#camera-feed');
    const canvas = this.$('#capture-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.closeCamera();
    const processed = this.preprocessImage(canvas);
    this.processImage(processed);
  }

  // ═══════════════════════════════════════
  //  FILE UPLOAD
  // ═══════════════════════════════════════

  handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        const processed = this.preprocessImage(c);
        this.processImage(processed);
      };
      img.onerror = () => this.toast('Could not read image', 'error');
      img.src = ev.target.result;
    };
    reader.onerror = () => this.toast('Upload failed', 'error');
    reader.readAsDataURL(file);
  }

  // ═══════════════════════════════════════
  //  IMAGE PREPROCESSING  (KEY OCR FIX)
  // ═══════════════════════════════════════

  preprocessImage(sourceCanvas) {
    let w = sourceCanvas.width;
    let h = sourceCanvas.height;
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // 1. Grayscale
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = gray;
    }

    // 2. Contrast boost
    const factor = 1.8;
    for (let i = 0; i < d.length; i += 4) {
      let v = factor * (d[i] - 128) + 128;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
    }

    // 3. Otsu's binarization
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) histogram[d[i]]++;

    const totalPixels = w * h;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * histogram[t];

    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = totalPixels - wB;
      if (wF === 0) break;
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      if (variance > maxVar) { maxVar = variance; threshold = t; }
    }

    for (let i = 0; i < d.length; i += 4) {
      const val = d[i] > threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);

    // 4. Upscale small images
    let outCanvas = sourceCanvas;
    if (w < 1500) {
      const scale = Math.ceil(1500 / w);
      const up = document.createElement('canvas');
      up.width = w * scale;
      up.height = h * scale;
      const uctx = up.getContext('2d');
      uctx.imageSmoothingEnabled = false;
      uctx.drawImage(sourceCanvas, 0, 0, up.width, up.height);
      outCanvas = up;
      w = up.width;
      h = up.height;
    }

    // 5. White border padding (helps Tesseract)
    const pad = 30;
    const bordered = document.createElement('canvas');
    bordered.width = w + pad * 2;
    bordered.height = h + pad * 2;
    const bctx = bordered.getContext('2d');
    bctx.fillStyle = '#ffffff';
    bctx.fillRect(0, 0, bordered.width, bordered.height);
    bctx.drawImage(outCanvas, pad, pad);

    return bordered;
  }

  // ═══════════════════════════════════════
  //  OCR PROCESSING
  // ═══════════════════════════════════════

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

      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$.,/()-+#@&\' ',
      });

      const { data: { text } } = await worker.recognize(canvas);
      await worker.terminate();

      console.log('── RAW OCR TEXT ──\n', text);

      const parsed = this.parseReceipt(text);
      this.items = parsed.items;
      this.tax = parsed.tax;

      if (this.items.length === 0) {
        this.toast('No items found — try manual entry or better lighting', 'warning', 4000);
        this.startManual();
        return;
      }

      this.$('#tax-input').value = this.tax.toFixed(2);
      this.renderItems();
      this.showScreen('items', 1);
      this.toast(`✅ Found ${this.items.length} items!`, 'success');
    } catch (err) {
      console.error('OCR Error:', err);
      this.toast('OCR failed — entering manual mode', 'error');
      this.startManual();
    }
  }

  // ═══════════════════════════════════════
  //  RECEIPT PARSER  (IMPROVED)
  // ═══════════════════════════════════════

  parseReceipt(text) {
    const cleaned = text
      .replace(/[|]/g, 'I')
      .replace(/[{}[\]]/g, '')
      .replace(/\r\n/g, '\n');

    const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    let detectedTax = 0;

    const skipRe = /\b(subtotal|sub\s*total|total|balance|amount\s*due|cash|credit|debit|visa|master\s*card|amex|change|payment|tender|thank|welcome|guest|server|table|check\s*#|order\s*#|date|time|receipt|tel|phone|fax|www\.|http|discount|promo|coupon|reward|store|address|register|cashier|transaction|ref\b|auth\b|card\s*#|member|loyalty|points|earned)\b/i;
    const taxRe = /\b(tax|hst|gst|pst|vat|sales\s*tax|state\s*tax|local\s*tax|mwst|ust|afa)\b/i;
    const tipRe = /\b(tip|gratuity|service\s*charge|service\s*fee)\b/i;

    for (const line of lines) {
      if (line.length < 3) continue;
      if (!/[a-zA-Z]/.test(line)) continue;
      if (/^[-=*_#.~]{3,}$/.test(line.replace(/\s/g, ''))) continue;
      if (/^\d[\d\s/:.\-,]+$/.test(line)) continue;

      const priceRegex = /\$?\s*(\d{1,5}[.,]\d{2})\b/g;
      const prices = [];
      let m;
      while ((m = priceRegex.exec(line)) !== null) {
        prices.push({ value: parseFloat(m[1].replace(',', '.')), index: m.index, len: m[0].length });
      }
      if (prices.length === 0) continue;

      const price = prices[prices.length - 1];

      if (taxRe.test(line)) { detectedTax = price.value; continue; }
      if (tipRe.test(line)) continue;
      if (skipRe.test(line)) continue;
      if (price.value > 500 || price.value <= 0) continue;

      let name = line.substring(0, prices[0].index).trim();
      name = name
        .replace(/^[\d]{1,3}\s+/, '')
        .replace(/^[#*\-.\s]+/, '')
        .replace(/[._*\-]+$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (name.length < 2) {
        const afterIdx = prices[prices.length - 1].index + prices[prices.length - 1].len;
        const after = line.substring(afterIdx).trim().replace(/^[-–—:]+/, '').trim();
        if (after.length >= 2 && /[a-zA-Z]/.test(after)) name = after;
        else continue;
      }

      if (name.length < 2) continue;

      items.push({ id: this.uid(), name: this.titleCase(name), price: price.value });
    }

    // Remove accidental total line
    if (items.length > 2) {
      const last = items[items.length - 1];
      const sumOthers = items.slice(0, -1).reduce((s, i) => s + i.price, 0);
      if (Math.abs(last.price - sumOthers) < 0.10) items.pop();
    }

    // Remove running subtotals
    if (items.length > 2) {
      const filtered = [];
      for (const item of items) {
        const prevSum = filtered.reduce((s, i) => s + i.price, 0);
        if (filtered.length >= 2 && Math.abs(item.price - prevSum) < 0.10) continue;
        filtered.push(item);
      }
      if (filtered.length >= items.length - 1) return { items: filtered, tax: detectedTax };
    }

    return { items, tax: detectedTax };
  }

  // ═══════════════════════════════════════
  //  MANUAL ENTRY
  // ═══════════════════════════════════════

  startManual() {
    if (!this.items.length) this.items = [];
    this.renderItems();
    this.showScreen('items', 1);
    this.showAddItemModal();
  }

  // ═══════════════════════════════════════
  //  ITEMS MANAGEMENT
  // ═══════════════════════════════════════

  renderItems() {
    const list = this.$('#items-list');
    if (!this.items.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>No items yet. Add your first item!</p></div>';
      return;
    }
    list.innerHTML = this.items.map(item => `
      <div class="item-card" data-id="${item.id}">
        <input class="item-name" value="${this.escapeHtml(item.name)}" data-id="${item.id}" data-field="name" aria-label="Item name">
        <input class="item-price" type="number" step="0.01" min="0" value="${item.price.toFixed(2)}" data-id="${item.id}" data-field="price" aria-label="Price">
        <button class="item-delete" data-id="${item.id}" aria-label="Remove">✕</button>
      </div>
    `).join('');

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
    if (item) item[field] = value;
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
    if (!name) { this.toast('Enter item name', 'warning'); return; }
    if (isNaN(price) || price <= 0) { this.toast('Enter a valid price', 'warning'); return; }
    this.items.push({ id: this.uid(), name, price });
    this.vibrate(10);
    this.hideAddItemModal();
    this.renderItems();
    this.toast('✅ Item added', 'success');
  }

  // ═══════════════════════════════════════
  //  PEOPLE MANAGEMENT
  // ═══════════════════════════════════════

  renderPeople() {
    const list = this.$('#people-list');
    list.innerHTML = this.people.map((p, i) => `
      <div class="person-chip" data-id="${p.id}">
        <div class="person-avatar" style="background:${this.getColor(i)}">${this.getInitials(p.name)}</div>
        <span>${this.escapeHtml(p.name)}</span>
        <button class="person-remove" data-id="${p.id}" aria-label="Remove">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.person-remove').forEach(el => {
      el.addEventListener('click', e => this.removePerson(e.currentTarget.dataset.id));
    });
    this.$('#btn-people-next').disabled = this.people.length < 2;
  }

  addPersonFromInput() {
    const input = this.$('#person-name-input');
    const name = input.value.trim();
    if (!name) return;
    if (this.people.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      this.toast('Already added!', 'warning');
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
    for (const itemId in this.assignments) this.assignments[itemId].delete(id);
    delete this.escrowTokens[id];
    this.renderPeople();
    this.renderQuickAdd();
  }

  saveGroupToStorage() {
    if (this.people.length < 2) return;
    const saved = JSON.parse(localStorage.getItem('snapfair_names') || '[]');
    for (const p of this.people) {
      if (!saved.includes(p.name)) saved.push(p.name);
    }
    localStorage.setItem('snapfair_names', JSON.stringify(saved.slice(-20)));
  }

  renderQuickAdd() {
    const saved = JSON.parse(localStorage.getItem('snapfair_names') || '[]');
    const current = new Set(this.people.map(p => p.name.toLowerCase()));
    const available = saved.filter(n => !current.has(n.toLowerCase()));
    const container = this.$('#quick-chips');
    if (!container) return;
    if (!available.length) { this.$('#quick-add')?.classList.add('hidden'); return; }
    this.$('#quick-add')?.classList.remove('hidden');
    container.innerHTML = available.map(n =>
      `<button class="quick-chip" data-name="${this.escapeHtml(n)}">${this.escapeHtml(n)}</button>`
    ).join('');
    container.querySelectorAll('.quick-chip').forEach(el => {
      el.addEventListener('click', () => {
        this.people.push({ id: this.uid(), name: el.dataset.name });
        this.vibrate(10);
        this.renderPeople();
        this.renderQuickAdd();
      });
    });
  }

  // ═══════════════════════════════════════
  //  ASSIGNMENTS
  // ═══════════════════════════════════════

  initAssignments() {
    for (const item of this.items) {
      if (!this.assignments[item.id]) this.assignments[item.id] = new Set();
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
                <span class="mini-avatar" style="background:${this.getColor(i)}">${this.getInitials(p.name)}</span>
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
    set.has(personId) ? set.delete(personId) : set.add(personId);
    this.renderAssignments();
  }

  assignEveryone(itemId) {
    if (!this.assignments[itemId]) this.assignments[itemId] = new Set();
    const set = this.assignments[itemId];
    set.size === this.people.length ? set.clear() : this.people.forEach(p => set.add(p.id));
    this.renderAssignments();
  }

  validateAssignments() {
    const un = this.items.find(item => {
      const a = this.assignments[item.id];
      return !a || a.size === 0;
    });
    if (un) { this.toast(`Assign "${un.name}" to someone`, 'warning'); return false; }
    return true;
  }

  // ═══════════════════════════════════════
  //  CALCULATIONS
  // ═══════════════════════════════════════

  getSubtotal() {
    return this.items.reduce((s, i) => s + i.price, 0);
  }

  getTipAmount() {
    return this.tipMode === 'custom' ? this.tipCustom : this.getSubtotal() * (this.tipPercent / 100);
  }

  getPersonBreakdown(personId) {
    const items = [];
    let subtotal = 0;
    for (const item of this.items) {
      const assigned = this.assignments[item.id];
      if (assigned && assigned.has(personId)) {
        const share = item.price / assigned.size;
        items.push({ name: item.name, fullPrice: item.price, share, sharedWith: assigned.size });
        subtotal += share;
      }
    }
    const totalSub = this.getSubtotal();
    const proportion = totalSub > 0 ? subtotal / totalSub : 0;
    const taxShare = this.tax * proportion;
    const tipShare = this.getTipAmount() * proportion;
    return { items, subtotal, taxShare, tipShare, total: subtotal + taxShare + tipShare, proportion };
  }

  // ═══════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════

  renderSummary() {
    this.$('#tax-input').value = this.tax.toFixed(2);
    this.renderSummaryTotals();
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

  getPaymentHandles() {
    return {
      pp: this.$('#paypal-handle')?.value.trim() || '',
      ws: this.$('#wise-handle')?.value.trim() || '',
      rv: this.$('#revolut-handle')?.value.trim() || '',
      vm: this.$('#venmo-handle')?.value.trim() || '',
      ca: this.$('#cashapp-handle')?.value.trim() || '',
      bn: this.$('#bank-name-handle')?.value.trim() || '',
      bi: this.$('#bank-iban-handle')?.value.trim() || '',
    };
  }

  buildPayLinks(amount, personName) {
    const h = this.getPaymentHandles();
    const note = encodeURIComponent(`SnapFair split - ${personName}`);
    let links = '';
    if (h.rv) links += `<a href="https://revolut.me/${h.rv}" target="_blank" rel="noopener" class="pay-link revolut">Revolut ${this.formatMoney(amount)}</a>`;
    if (h.ws) {
      const u = h.ws.startsWith('http') ? h.ws : `https://wise.com/pay/${h.ws}`;
      links += `<a href="${u}" target="_blank" rel="noopener" class="pay-link wise">Wise ${this.formatMoney(amount)}</a>`;
    }
    if (h.pp) links += `<a href="https://paypal.me/${h.pp}/${amount.toFixed(2)}" target="_blank" rel="noopener" class="pay-link paypal">PayPal ${this.formatMoney(amount)}</a>`;
    if (h.vm) links += `<a href="https://venmo.com/${h.vm}?txn=charge&amount=${amount.toFixed(2)}&note=${note}" target="_blank" rel="noopener" class="pay-link venmo">Venmo ${this.formatMoney(amount)}</a>`;
    if (h.ca) {
      const tag = h.ca.replace(/^\$/, '');
      links += `<a href="https://cash.app/$${tag}/${amount.toFixed(2)}" target="_blank" rel="noopener" class="pay-link cashapp">Cash App ${this.formatMoney(amount)}</a>`;
    }
    if (h.bn && h.bi) {
      links += `<div class="bank-details">
        <div><span class="bank-label">Name: </span><span class="bank-value" onclick="app.copyText(this)">${this.escapeHtml(h.bn)}</span></div>
        <div><span class="bank-label">IBAN: </span><span class="bank-value" onclick="app.copyText(this)">${this.escapeHtml(h.bi)}</span></div>
      </div>`;
    }
    return links;
  }

  copyText(el) {
    navigator.clipboard.writeText(el.textContent)
      .then(() => this.toast('📋 Copied!', 'success'))
      .catch(() => {});
  }

  renderSummaryTotals() {
    this.tax = parseFloat(this.$('#tax-input').value) || 0;
    const summaryList = this.$('#summary-list');
    let html = '';

    this.people.forEach((person, index) => {
      const bd = this.getPersonBreakdown(person.id);
      const payLinksHtml = this.buildPayLinks(bd.total, person.name);
      const token = this.escrowTokens[person.id];
      const isVerified = token?.status === 'verified';

      let badgeHtml = '';
      if (token) {
        badgeHtml = `<span class="escrow-badge ${isVerified ? 'verified' : 'pending'}">${isVerified ? '✅ Paid' : '⏳ Pending'}</span>`;
      }

      const escrowBtnClass = isVerified ? 'btn-escrow verified-btn' : 'btn-escrow';
      const escrowBtnText = isVerified ? '✅ Verified' : '🔐 Request Payment';

      html += `
        <div class="summary-card">
          ${badgeHtml}
          <div class="summary-card-header">
            <div class="summary-person-info">
              <div class="person-avatar" style="background:${this.getColor(index)}">${this.getInitials(person.name)}</div>
              <span class="summary-person-name">${this.escapeHtml(person.name)}</span>
            </div>
            <span class="summary-person-total">${this.formatMoney(bd.total)}</span>
          </div>
          <div class="summary-card-details">
            ${bd.items.map(item => `
              <div class="summary-item-row">
                <span>${this.escapeHtml(item.name)}${item.sharedWith > 1 ? ` (÷${item.sharedWith})` : ''}</span>
                <span>${this.formatMoney(item.share)}</span>
              </div>
            `).join('')}
            ${this.tax > 0 ? `<div class="summary-item-row tax-row"><span>Tax</span><span>${this.formatMoney(bd.taxShare)}</span></div>` : ''}
            ${this.getTipAmount() > 0 ? `<div class="summary-item-row tip-row"><span>Tip</span><span>${this.formatMoney(bd.tipShare)}</span></div>` : ''}
          </div>
          ${payLinksHtml ? `<div class="summary-pay-links">${payLinksHtml}</div>` : ''}
          <div class="summary-pay-links" style="justify-content:center">
            <button class="${escrowBtnClass}" data-person-id="${person.id}">${escrowBtnText}</button>
          </div>
        </div>
      `;
    });

    summaryList.innerHTML = html;

    // Bind escrow buttons
    summaryList.querySelectorAll('.btn-escrow').forEach(btn => {
      btn.addEventListener('click', () => this.openEscrowModal(btn.dataset.personId));
    });

    const subtotal = this.getSubtotal();
    const tipAmount = this.getTipAmount();
    this.$('#check-subtotal').textContent = this.formatMoney(subtotal);
    this.$('#check-tax').textContent = this.formatMoney(this.tax);
    this.$('#check-tip').textContent = this.formatMoney(tipAmount);
    this.$('#check-total').textContent = this.formatMoney(subtotal + this.tax + tipAmount);
  }

  // ═══════════════════════════════════════
  //  ESCROW / QR CODE SYSTEM
  // ═══════════════════════════════════════

  generateEscrowCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  buildPaymentUrl(person, breakdown, token) {
    const compact = {
      n: person.name,
      a: Math.round(breakdown.total * 100),
      c: token.code,
      py: {}
    };

    const h = this.getPaymentHandles();
    if (h.pp) compact.py.pp = h.pp;
    if (h.ws) compact.py.ws = h.ws;
    if (h.rv) compact.py.rv = h.rv;
    if (h.vm) compact.py.vm = h.vm;
    if (h.ca) compact.py.ca = h.ca;
    if (h.bn) compact.py.bn = h.bn;
    if (h.bi) compact.py.bi = h.bi;

    compact.it = breakdown.items.map(i => [
      i.name.substring(0, 20),
      Math.round(i.share * 100),
      i.sharedWith
    ]);

    if (breakdown.taxShare > 0) compact.tx = Math.round(breakdown.taxShare * 100);
    if (breakdown.tipShare > 0) compact.tp = Math.round(breakdown.tipShare * 100);

    try {
      const json = JSON.stringify(compact);
      const encoded = btoa(unescape(encodeURIComponent(json)));
      return `${window.location.origin}${window.location.pathname}#pay=${encoded}`;
    } catch {
      return window.location.href;
    }
  }

  generateQR(targetId, data) {
    try {
      if (typeof QRious === 'undefined') {
        console.warn('QRious not loaded');
        this.showQRFallback(targetId);
        return;
      }

      const canvas = document.getElementById(targetId);
      if (!canvas) return;

      // Remove any CSS sizing — let QRious control the canvas
      canvas.removeAttribute('width');
      canvas.removeAttribute('height');
      canvas.style.width = '';
      canvas.style.height = '';

      new QRious({
        element: canvas,
        value: data,
        size: 220,
        level: 'M',
        background: '#FFFFFF',
        foreground: '#111827',
        padding: 16
      });

      console.log('QR generated, data length:', data.length);
    } catch (err) {
      console.error('QR generation failed:', err);
      this.showQRFallback(targetId);
    }
  }

  showQRFallback(targetId) {
    const canvas = document.getElementById(targetId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.style.display = 'none';
    const fallback = document.createElement('div');
    fallback.className = 'qr-fallback';
    fallback.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">📱 QR unavailable<br><small>Use Share/Copy buttons instead</small></p>`;
    parent.appendChild(fallback);
  }

  openEscrowModal(personId) {
    const person = this.people.find(p => p.id === personId);
    if (!person) return;
    const bd = this.getPersonBreakdown(personId);

    if (!this.escrowTokens[personId]) {
      this.escrowTokens[personId] = { code: this.generateEscrowCode(), status: 'pending' };
    }
    const token = this.escrowTokens[personId];
    const payUrl = this.buildPaymentUrl(person, bd, token);

    const modal = this.$('#escrow-modal');
    const body = this.$('#escrow-modal-body');

    body.innerHTML = `
      <h3>🔐 Payment Request</h3>
      <div class="escrow-info">
        <div class="escrow-person">For: <strong>${this.escapeHtml(person.name)}</strong></div>
        <div class="escrow-amount">${this.formatMoney(bd.total)}</div>
      </div>
      <div class="escrow-qr">
        <canvas id="escrow-qr-canvas"></canvas>
      </div>
      <div class="escrow-code-section">
        <label>Confirmation code (keep secret until verified)</label>
        <div class="escrow-code ${token.status === 'verified' ? 'verified' : ''}">${token.code}</div>
        <p class="text-muted small" style="margin-top:6px">Payer sees this code only after clicking "I've Paid"</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary btn-block" id="btn-escrow-share">📤 Share Payment Link</button>
        <button class="btn btn-secondary btn-block" id="btn-escrow-copy">📋 Copy Link</button>
      </div>
      <div class="escrow-verify-section">
        <label>Verify — enter the code your friend gives you:</label>
        <div class="escrow-verify-row">
          <input type="text" id="escrow-verify-input" class="input" placeholder="XXXXXX" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button class="btn btn-primary" id="btn-escrow-verify">Verify</button>
        </div>
        <div id="escrow-verify-result"></div>
        ${token.status === 'verified' ? '<div class="escrow-verified">✅ Payment Verified!</div>' : ''}
      </div>
      <button class="btn btn-outline btn-block" id="btn-escrow-close" style="margin-top:4px">Close</button>
    `;

    modal.classList.remove('hidden');

    // Generate QR after DOM renders
    requestAnimationFrame(() => {
      setTimeout(() => this.generateQR('escrow-qr-canvas', payUrl), 50);
    });

    // Events
    this.$('#btn-escrow-share').addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Pay ${this.formatMoney(bd.total)} — SnapFair`,
            text: `${person.name} owes ${this.formatMoney(bd.total)}`,
            url: payUrl
          });
          return;
        } catch (e) { if (e.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(payUrl); } catch {}
      this.toast('📋 Link copied!', 'success');
    });

    this.$('#btn-escrow-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(payUrl); } catch {}
      this.toast('📋 Payment link copied!', 'success');
    });

    this.$('#btn-escrow-verify').addEventListener('click', () => {
      const input = this.$('#escrow-verify-input').value.trim().toUpperCase();
      const resultEl = this.$('#escrow-verify-result');
      if (!input) { this.toast('Enter the code', 'warning'); return; }
      if (input === token.code) {
        token.status = 'verified';
        this.vibrate(20);
        resultEl.innerHTML = '<div class="escrow-verified">✅ Payment Verified!</div>';
        this.toast('✅ Payment verified!', 'success');
        setTimeout(() => { modal.classList.add('hidden'); this.renderSummaryTotals(); }, 1500);
      } else {
        this.vibrate([50, 30, 50]);
        resultEl.innerHTML = '<div style="color:var(--danger);font-size:14px;padding:8px 0;font-weight:600">❌ Wrong code — try again</div>';
        this.$('#escrow-verify-input').value = '';
        this.$('#escrow-verify-input').focus();
      }
    });

    this.$('#escrow-verify-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.$('#btn-escrow-verify')?.click();
    });

    this.$('#btn-escrow-close').addEventListener('click', () => modal.classList.add('hidden'));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  // ═══════════════════════════════════════
  //  PAYMENT REQUEST (payer opens QR link)
  // ═══════════════════════════════════════

  loadPaymentRequest() {
    const hash = window.location.hash;
    if (!hash.startsWith('#pay=')) return false;
    try {
      const encoded = hash.slice(5);
      const json = decodeURIComponent(escape(atob(encoded)));
      const data = JSON.parse(json);
      this.renderPaymentRequestScreen(data);
      return true;
    } catch (err) {
      console.error('Failed to load payment request:', err);
      return false;
    }
  }

  renderPaymentRequestScreen(data) {
    this.showScreen('pay-request');
    const container = this.$('#pay-request-content');

    const amount = (data.a || 0) / 100;
    const code = data.c;
    const handles = data.py || {};
    const note = encodeURIComponent(`SnapFair - ${data.n}`);

    const items = (data.it || []).map(i => ({
      name: Array.isArray(i) ? i[0] : i.n,
      share: Array.isArray(i) ? i[1] / 100 : i.s,
      sharedWith: Array.isArray(i) ? i[2] : (i.w || 1)
    }));

    const taxShare = (data.tx || 0) / 100;
    const tipShare = (data.tp || 0) / 100;

    let payLinks = '';
    if (handles.rv) payLinks += `<a href="https://revolut.me/${handles.rv}" target="_blank" class="pay-link revolut">Revolut</a>`;
    if (handles.ws) {
      const u = handles.ws.startsWith('http') ? handles.ws : `https://wise.com/pay/${handles.ws}`;
      payLinks += `<a href="${u}" target="_blank" class="pay-link wise">Wise</a>`;
    }
    if (handles.pp) payLinks += `<a href="https://paypal.me/${handles.pp}/${amount.toFixed(2)}" target="_blank" class="pay-link paypal">PayPal</a>`;
    if (handles.vm) payLinks += `<a href="https://venmo.com/${handles.vm}?txn=charge&amount=${amount.toFixed(2)}&note=${note}" target="_blank" class="pay-link venmo">Venmo</a>`;
    if (handles.ca) {
      const tag = handles.ca.replace(/^\$/, '');
      payLinks += `<a href="https://cash.app/$${tag}/${amount.toFixed(2)}" target="_blank" class="pay-link cashapp">Cash App</a>`;
    }

    container.innerHTML = `
      <div class="pay-request-card">
        <div class="pay-request-header">
          <div class="pay-request-amount">${this.formatMoney(amount)}</div>
          <div class="pay-request-for">Payment requested from <strong>${this.escapeHtml(data.n)}</strong></div>
        </div>
        <div class="pay-request-items">
          ${items.map(i => `
            <div class="summary-item-row">
              <span>${this.escapeHtml(i.name)}${i.sharedWith > 1 ? ` (÷${i.sharedWith})` : ''}</span>
              <span>${this.formatMoney(i.share)}</span>
            </div>
          `).join('')}
          ${taxShare > 0 ? `<div class="summary-item-row tax-row"><span>Tax</span><span>${this.formatMoney(taxShare)}</span></div>` : ''}
          ${tipShare > 0 ? `<div class="summary-item-row tip-row"><span>Tip</span><span>${this.formatMoney(tipShare)}</span></div>` : ''}
        </div>
        ${payLinks ? `<div class="pay-request-methods"><p class="text-muted small">Pay via:</p><div class="pay-links-row">${payLinks}</div></div>` : ''}
        ${handles.bn && handles.bi ? `
          <div style="padding:12px 20px;border-top:1px solid var(--border)">
            <div class="bank-details">
              <div><span class="bank-label">Name: </span><span class="bank-value">${this.escapeHtml(handles.bn)}</span></div>
              <div><span class="bank-label">IBAN: </span><span class="bank-value">${this.escapeHtml(handles.bi)}</span></div>
            </div>
          </div>
        ` : ''}
        <div class="pay-request-confirm">
          <button class="btn btn-primary btn-large btn-block" id="btn-confirm-paid">✅ I've Paid — Show Confirmation Code</button>
        </div>
        <div class="pay-request-code hidden" id="pay-code-reveal">
          <div class="code-reveal-label">Your confirmation code:</div>
          <div class="code-reveal-value">${this.escapeHtml(code)}</div>
          <p class="text-muted small" style="margin-top:8px">Send this code to the person who requested payment</p>
          <button class="btn btn-secondary btn-block" id="btn-copy-paycode" style="margin-top:12px">📋 Copy Code</button>
        </div>
      </div>
    `;

    this.$('#btn-confirm-paid').addEventListener('click', () => {
      const btn = this.$('#btn-confirm-paid');
      btn.disabled = true;
      btn.textContent = '✅ Payment Confirmed!';
      btn.style.background = '#22C55E';
      this.$('#pay-code-reveal').classList.remove('hidden');
      this.vibrate(20);
      this.toast('Code revealed! Share it with the requester', 'success', 4000);
    });

    this.$('#btn-copy-paycode')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); } catch {}
      this.toast('📋 Code copied!', 'success');
    });
  }

  // ═══════════════════════════════════════
  //  SHARE / COPY
  // ═══════════════════════════════════════

  async shareSplit() {
    const text = this.buildSummaryText();
    const shareData = this.buildShareableData();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SnapFair — Bill Split', text, url: shareData.url });
        this.toast('📤 Shared!', 'success');
        return;
      } catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(shareData.url + '\n\n' + text); this.toast('📋 Link & summary copied!', 'success'); }
    catch { this.toast('Could not share', 'error'); }
  }

  async copySummary() {
    const text = this.buildSummaryText();
    try { await navigator.clipboard.writeText(text); this.toast('📋 Summary copied!', 'success'); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      this.toast('📋 Summary copied!', 'success');
    }
  }

  buildSummaryText() {
    const lines = ['🧾 SnapFair — Bill Split\n'];
    this.people.forEach(person => {
      const bd = this.getPersonBreakdown(person.id);
      lines.push(`${person.name}: ${this.formatMoney(bd.total)}`);
      bd.items.forEach(item => {
        lines.push(`  • ${item.name}${item.sharedWith > 1 ? ` (÷${item.sharedWith})` : ''}: ${this.formatMoney(item.share)}`);
      });
      if (bd.taxShare > 0) lines.push(`  • Tax: ${this.formatMoney(bd.taxShare)}`);
      if (bd.tipShare > 0) lines.push(`  • Tip: ${this.formatMoney(bd.tipShare)}`);
      lines.push('');
    });
    lines.push(`Total: ${this.formatMoney(this.getSubtotal() + this.tax + this.getTipAmount())}`);
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
    } catch { return { url: window.location.href }; }
  }

  loadSharedSplit() {
    const hash = window.location.hash;
    if (!hash.startsWith('#split=')) return false;
    try {
      const encoded = hash.slice(7);
      const data = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      this.people = data.p.map(p => ({ id: p.id, name: p.n }));
      this.items = data.i.map(item => ({ id: this.uid(), name: item.n, price: item.p, _a: item.a }));
      this.assignments = {};
      this.items.forEach((item, idx) => { this.assignments[item.id] = new Set(data.i[idx].a); });
      this.tax = data.t || 0;
      this.tipMode = data.tm || 'percent';
      if (this.tipMode === 'custom') this.tipCustom = data.tp || 0;
      else this.tipPercent = data.tp || 0;
      this.renderSharedView();
      this.showScreen('shared');
      return true;
    } catch (err) { console.error('Shared split load failed:', err); return false; }
  }

  renderSharedView() {
    const summaryEl = this.$('#shared-summary');
    const totalsEl = this.$('#shared-totals');
    let html = '';
    this.people.forEach((person, index) => {
      const bd = this.getPersonBreakdown(person.id);
      html += `
        <div class="summary-card">
          <div class="summary-card-header">
            <div class="summary-person-info">
              <div class="person-avatar" style="background:${this.getColor(index)}">${this.getInitials(person.name)}</div>
              <span class="summary-person-name">${this.escapeHtml(person.name)}</span>
            </div>
            <span class="summary-person-total">${this.formatMoney(bd.total)}</span>
          </div>
          <div class="summary-card-details">
            ${bd.items.map(i => `
              <div class="summary-item-row">
                <span>${this.escapeHtml(i.name)}${i.sharedWith > 1 ? ` (÷${i.sharedWith})` : ''}</span>
                <span>${this.formatMoney(i.share)}</span>
              </div>
            `).join('')}
            ${bd.taxShare > 0 ? `<div class="summary-item-row tax-row"><span>Tax</span><span>${this.formatMoney(bd.taxShare)}</span></div>` : ''}
            ${bd.tipShare > 0 ? `<div class="summary-item-row tip-row"><span>Tip</span><span>${this.formatMoney(bd.tipShare)}</span></div>` : ''}
          </div>
        </div>
      `;
    });
    summaryEl.innerHTML = html;
    const sub = this.getSubtotal(), tip = this.getTipAmount();
    totalsEl.innerHTML = `
      <div class="totals-row"><span>Subtotal</span><span>${this.formatMoney(sub)}</span></div>
      <div class="totals-row"><span>Tax</span><span>${this.formatMoney(this.tax)}</span></div>
      <div class="totals-row"><span>Tip</span><span>${this.formatMoney(tip)}</span></div>
      <div class="totals-row total"><span>Total</span><span>${this.formatMoney(sub + this.tax + tip)}</span></div>
    `;
  }

  // ═══════════════════════════════════════
  //  RESET
  // ═══════════════════════════════════════

  resetApp() {
    this.items = [];
    this.people = [];
    this.assignments = {};
    this.tax = 0;
    this.tipPercent = 0;
    this.tipCustom = 0;
    this.tipMode = 'percent';
    this.currentStep = 0;
    this.escrowTokens = {};
    this.$$('.tip-btn').forEach(b => b.classList.remove('active'));
    this.$('#custom-tip-row')?.classList.add('hidden');
    window.location.hash = '';
    this.showScreen('home');
  }

  // ═══════════════════════════════════════
  //  PWA
  // ═══════════════════════════════════════

  async registerSW() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('/sw.js'); } catch {}
    }
  }
}

// ═══════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SnapFair();
});

