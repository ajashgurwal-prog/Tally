/**
 * @fileoverview Daily Expense & Pocket Money Tally — Application Logic
 *
 * A single-screen web app for quick expense logging with four categories
 * (Chai & Snacks, Travel, Stationery, Other). Entries are persisted in
 * localStorage. Running totals for Today and This Week are computed from
 * entry timestamps on every render.
 *
 * @version 1.0.0
 * @license MIT
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONSTANTS & CONFIGURATION
  // =========================================================================

  /** @constant {string} STORAGE_KEY — localStorage key for expense data */
  const STORAGE_KEY = 'pocket_money_tally_data_v1';

  /** @constant {number} MAX_AMOUNT — Maximum allowed expense amount (₹) */
  const MAX_AMOUNT = 100000;

  /** @constant {number} MIN_AMOUNT — Minimum allowed expense amount (₹) */
  const MIN_AMOUNT = 0.5;

  /** @constant {number} MAX_TITLE_LENGTH — Maximum characters for item name */
  const MAX_TITLE_LENGTH = 50;

  /** @constant {number} TOAST_DURATION_MS — Toast visibility duration (ms) */
  const TOAST_DURATION_MS = 2400;

  /** @constant {number} DELETE_ANIMATION_MS — Delete animation duration (ms) */
  const DELETE_ANIMATION_MS = 200;

  /**
   * @constant {Object.<string, {icon: string, classKey: string}>} CATEGORIES
   * Valid category definitions with their display icon and CSS class key.
   */
  const CATEGORIES = Object.freeze({
    'Chai & Snacks': { icon: '☕', classKey: 'chai' },
    'Travel':        { icon: '🛺', classKey: 'travel' },
    'Stationery':    { icon: '📝', classKey: 'stationery' },
    'Other':         { icon: '🏷️', classKey: 'other' }
  });

  /** @constant {string[]} VALID_CATEGORY_NAMES — List of valid category keys */
  const VALID_CATEGORY_NAMES = Object.keys(CATEGORIES);

  // =========================================================================
  // 2. APPLICATION STATE
  // =========================================================================

  /**
   * @typedef {Object} Expense
   * @property {string}  id        — Unique identifier (e.g. "exp_1700000000000_ab12c")
   * @property {string}  title     — Display name of the expense item
   * @property {number}  amount    — Expense amount in ₹ (positive, ≤ MAX_AMOUNT)
   * @property {string}  category  — One of the VALID_CATEGORY_NAMES
   * @property {string}  icon      — Emoji icon for the category
   * @property {number}  timestamp — Unix timestamp (ms) when the expense was logged
   */

  /** @type {Expense[]} In-memory expense list (most recent first) */
  let expenses = [];

  /** @type {string} Currently selected category for the "Add" button */
  let selectedCategory = 'Chai & Snacks';

  /** @type {number|null} Active toast timeout ID */
  let toastTimeout = null;

  // =========================================================================
  // 3. DOM ELEMENT REFERENCES
  // =========================================================================

  /**
   * @type {Object.<string, HTMLElement>}
   * Cached DOM references, populated once on init.
   */
  const dom = {};

  /**
   * Populates the dom cache object. Called once during init().
   * @throws {Error} If a required DOM element is missing.
   */
  function cacheDomElements() {
    const requiredIds = [
      'expenseForm', 'itemTitle', 'itemAmount', 'amountWrapper',
      'addExpenseBtn', 'expenseList', 'emptyState',
      'todayTotal', 'weekTotal', 'todayCountPill', 'weekCountPill',
      'logCount', 'clearAllBtn', 'confirmModal', 'cancelClearBtn',
      'confirmClearBtn', 'toast', 'currentDateDisplay', 'amountError',
      'srAnnounce'
    ];

    for (const id of requiredIds) {
      const el = document.getElementById(id);
      if (!el) {
        console.error('[PocketTally] Required DOM element not found: #' + id);
      }
      dom[id] = el;
    }

    // Also cache non-ID-based collections
    dom.categoryButtons = document.querySelectorAll('.category-btn[data-category]');
    dom.chipButtons = document.querySelectorAll('.chip-btn[data-add]');
  }

  // =========================================================================
  // 4. UTILITY FUNCTIONS
  // =========================================================================

  /**
   * Escapes HTML special characters to prevent XSS when inserting into innerHTML.
   * @param {string} str — Raw string input
   * @returns {string} HTML-safe string
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /**
   * Generates a unique ID for a new expense entry.
   * @returns {string} A unique ID string
   */
  function generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return 'exp_' + timestamp + '_' + random;
  }

  /**
   * Returns the Unix timestamp (ms) for midnight (00:00:00.000) of today in local time.
   * @returns {number} Millisecond timestamp
   */
  function getStartOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }

  /**
   * Returns the Unix timestamp (ms) for Monday 00:00:00.000 of the current week (ISO week,
   * Monday is the first day of the week).
   * @returns {number} Millisecond timestamp
   */
  function getStartOfThisWeek() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, …
    // Distance back to Monday: Sunday → 6, otherwise dayOfWeek - 1
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
  }

  /**
   * Formats a number as an Indian-locale currency string (without the ₹ symbol).
   * @param {number} amount — The amount to format
   * @returns {string} Formatted string, e.g. "1,250" or "42.50"
   */
  function formatRupees(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '0';
    return amount.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
    });
  }

  /**
   * Formats a timestamp into a human-readable relative date/time string.
   * @param {number} timestamp — Unix timestamp in milliseconds
   * @returns {string} Formatted string, e.g. "Today, 3:45 pm" or "12 Nov, 10:30 am"
   */
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    const timeStr = date.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Check if same calendar day
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return 'Today, ' + timeStr;
    }

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Yesterday, ' + timeStr;
    }

    // Older dates: "12 Nov, 10:30 am"
    const dateStr = date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    });
    return dateStr + ', ' + timeStr;
  }

  // =========================================================================
  // 5. DATA LAYER — localStorage Persistence
  // =========================================================================

  /**
   * Loads and validates expenses from localStorage into the in-memory array.
   * Silently discards any malformed entries.
   */
  function loadExpenses() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        expenses = [];
        return;
      }
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        console.warn('[PocketTally] Stored data is not an array, resetting.');
        expenses = [];
        return;
      }
      // Validate each entry
      expenses = parsed.filter(function (entry) {
        return validateExpenseObject(entry);
      });
    } catch (err) {
      console.error('[PocketTally] Failed to parse expenses from localStorage:', err);
      expenses = [];
    }
  }

  /**
   * Saves the in-memory expenses array to localStorage.
   */
  function saveExpenses() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    } catch (err) {
      console.error('[PocketTally] Failed to save expenses:', err);
      showToast('⚠️ Storage error — unable to save.');
    }
  }

  /**
   * Validates that an object conforms to the Expense schema.
   * @param {*} obj — Object to validate
   * @returns {boolean} True if valid
   */
  function validateExpenseObject(obj) {
    if (obj === null || typeof obj !== 'object') return false;
    if (typeof obj.id !== 'string' || obj.id.length === 0) return false;
    if (typeof obj.title !== 'string' || obj.title.length === 0 || obj.title.length > MAX_TITLE_LENGTH) return false;
    if (typeof obj.amount !== 'number' || isNaN(obj.amount) || obj.amount < MIN_AMOUNT || obj.amount > MAX_AMOUNT) return false;
    if (typeof obj.category !== 'string' || VALID_CATEGORY_NAMES.indexOf(obj.category) === -1) return false;
    if (typeof obj.timestamp !== 'number' || obj.timestamp <= 0) return false;
    return true;
  }

  // =========================================================================
  // 6. INPUT VALIDATION
  // =========================================================================

  /**
   * Validates the amount input value.
   * @returns {{valid: boolean, amount: number, error: string}}
   */
  function validateAmountInput() {
    var rawValue = dom.itemAmount.value.trim();

    if (!rawValue) {
      return { valid: false, amount: 0, error: 'Please enter an amount.' };
    }

    var amount = parseFloat(rawValue);

    if (isNaN(amount)) {
      return { valid: false, amount: 0, error: 'Please enter a valid number.' };
    }
    if (amount < MIN_AMOUNT) {
      return { valid: false, amount: 0, error: 'Minimum amount is ₹' + MIN_AMOUNT + '.' };
    }
    if (amount > MAX_AMOUNT) {
      return { valid: false, amount: 0, error: 'Maximum amount is ₹' + formatRupees(MAX_AMOUNT) + '.' };
    }

    return { valid: true, amount: amount, error: '' };
  }

  /**
   * Sanitizes a text input string: trims and clamps to max length.
   * @param {string} str — Raw input string
   * @returns {string} Sanitized string
   */
  function sanitizeTitle(str) {
    if (typeof str !== 'string') return '';
    return str.trim().substring(0, MAX_TITLE_LENGTH);
  }

  /**
   * Validates that a category name is one of the allowed values.
   * @param {string} cat — Category name to validate
   * @returns {string} Validated category name, defaults to 'Other'
   */
  function validateCategory(cat) {
    if (typeof cat === 'string' && VALID_CATEGORY_NAMES.indexOf(cat) !== -1) {
      return cat;
    }
    return 'Other';
  }

  /**
   * Shows a visual shake animation and error message on the amount input.
   * @param {string} message — Error message to display
   */
  function showAmountError(message) {
    var wrapper = dom.amountWrapper;
    var errorEl = dom.amountError;

    if (wrapper) {
      wrapper.classList.remove('shake');
      // Force reflow to restart animation
      void wrapper.offsetWidth;
      wrapper.classList.add('shake', 'error');
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
    if (dom.itemAmount) {
      dom.itemAmount.setAttribute('aria-invalid', 'true');
      dom.itemAmount.focus();
    }
  }

  /**
   * Clears the amount error state.
   */
  function clearAmountError() {
    var wrapper = dom.amountWrapper;
    var errorEl = dom.amountError;

    if (wrapper) {
      wrapper.classList.remove('shake', 'error');
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    if (dom.itemAmount) {
      dom.itemAmount.removeAttribute('aria-invalid');
    }
  }

  // =========================================================================
  // 7. CORE OPERATIONS — Add, Delete, Clear
  // =========================================================================

  /**
   * Logs a new expense entry with the given category.
   * Validates inputs, creates the entry, saves to localStorage, and re-renders.
   * @param {string} category — Category name (must be a valid category)
   * @returns {boolean} True if the expense was successfully logged
   */
  function addExpense(category) {
    clearAmountError();

    // Validate category
    var validCategory = validateCategory(category);

    // Validate amount
    var amountResult = validateAmountInput();
    if (!amountResult.valid) {
      showAmountError(amountResult.error);
      showToast('⚠️ ' + amountResult.error);
      announceToScreenReader(amountResult.error);
      return false;
    }

    // Sanitize title
    var title = sanitizeTitle(dom.itemTitle.value);
    if (!title) {
      title = validCategory; // Default to category name if no title entered
    }

    var catConfig = CATEGORIES[validCategory];

    /** @type {Expense} */
    var newExpense = {
      id: generateId(),
      title: title,
      amount: amountResult.amount,
      category: validCategory,
      icon: catConfig.icon,
      timestamp: Date.now()
    };

    // Prepend to array (most recent first)
    expenses.unshift(newExpense);
    saveExpenses();
    render();

    // Reset form inputs
    dom.itemTitle.value = '';
    dom.itemAmount.value = '';

    var message = 'Added ₹' + formatRupees(amountResult.amount) + ' for ' + title;
    showToast('✓ ' + message);
    announceToScreenReader(message);

    return true;
  }

  /**
   * Deletes a single expense by its unique ID.
   * Applies a CSS animation before removal if a DOM element is provided.
   * @param {string} id — The expense ID to delete
   * @param {HTMLElement} [itemElement] — Optional DOM element for delete animation
   */
  function deleteExpense(id, itemElement) {
    if (typeof id !== 'string' || !id) return;

    var performDelete = function () {
      var originalLength = expenses.length;
      expenses = expenses.filter(function (exp) {
        return exp.id !== id;
      });

      if (expenses.length < originalLength) {
        saveExpenses();
        render();
        showToast('Expense removed');
        announceToScreenReader('Expense deleted');
      }
    };

    // Animate removal if element is provided
    if (itemElement) {
      itemElement.classList.add('deleting');
      setTimeout(performDelete, DELETE_ANIMATION_MS);
    } else {
      performDelete();
    }
  }

  /**
   * Clears all expense entries after user confirmation.
   */
  function clearAllExpenses() {
    if (expenses.length === 0) {
      showToast('No expenses to clear');
      return;
    }
    expenses = [];
    saveExpenses();
    render();
    closeClearModal();
    showToast('All expenses cleared');
    announceToScreenReader('All expenses have been cleared');
  }

  // =========================================================================
  // 8. MODAL MANAGEMENT
  // =========================================================================

  /** @type {HTMLElement|null} Element that had focus before modal opened */
  let previousFocusElement = null;

  /**
   * Opens the Clear All confirmation modal with proper focus management.
   */
  function openClearModal() {
    if (expenses.length === 0) {
      showToast('Spend log is already empty');
      return;
    }
    previousFocusElement = document.activeElement;
    dom.confirmModal.classList.remove('hidden');
    // Focus the cancel button (safer default)
    if (dom.cancelClearBtn) {
      dom.cancelClearBtn.focus();
    }
  }

  /**
   * Closes the Clear All confirmation modal and restores focus.
   */
  function closeClearModal() {
    dom.confirmModal.classList.add('hidden');
    // Restore focus to the element that triggered the modal
    if (previousFocusElement && typeof previousFocusElement.focus === 'function') {
      previousFocusElement.focus();
    }
    previousFocusElement = null;
  }

  // =========================================================================
  // 9. NOTIFICATIONS
  // =========================================================================

  /**
   * Displays a visual toast notification at the bottom of the screen.
   * @param {string} message — The message to display
   */
  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('show');

    if (toastTimeout !== null) {
      clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(function () {
      dom.toast.classList.remove('show');
      toastTimeout = null;
    }, TOAST_DURATION_MS);
  }

  /**
   * Announces a message to screen readers via an aria-live region.
   * @param {string} message — The message to announce
   */
  function announceToScreenReader(message) {
    if (!dom.srAnnounce) return;
    // Clear and reset to trigger re-announcement
    dom.srAnnounce.textContent = '';
    requestAnimationFrame(function () {
      dom.srAnnounce.textContent = message;
    });
  }

  // =========================================================================
  // 10. RENDERING — UI Updates
  // =========================================================================

  /**
   * Re-renders the entire UI:
   * - Computes running totals (Today & This Week) from expense timestamps
   * - Updates summary cards
   * - Rebuilds the expense list using DocumentFragment for efficiency
   * - Toggles empty state visibility
   * - Updates Clear All button state
   */
  function render() {
    var startOfToday = getStartOfToday();
    var startOfThisWeek = getStartOfThisWeek();

    // Calculate running totals in a single pass
    var todaySum = 0;
    var todayCount = 0;
    var weekSum = 0;
    var weekCount = 0;

    for (var i = 0; i < expenses.length; i++) {
      var amt = expenses[i].amount;
      var ts = expenses[i].timestamp;

      if (ts >= startOfToday) {
        todaySum += amt;
        todayCount++;
      }
      if (ts >= startOfThisWeek) {
        weekSum += amt;
        weekCount++;
      }
    }

    // Update Running Totals Cards
    if (dom.todayTotal) dom.todayTotal.textContent = formatRupees(todaySum);
    if (dom.weekTotal) dom.weekTotal.textContent = formatRupees(weekSum);
    if (dom.todayCountPill) dom.todayCountPill.textContent = todayCount + (todayCount === 1 ? ' item' : ' items');
    if (dom.weekCountPill) dom.weekCountPill.textContent = weekCount + (weekCount === 1 ? ' item' : ' items');
    if (dom.logCount) dom.logCount.textContent = expenses.length + (expenses.length === 1 ? ' entry' : ' entries');

    // Build Expense List with DocumentFragment for batch DOM insertion
    var fragment = document.createDocumentFragment();
    dom.expenseList.innerHTML = '';

    if (expenses.length === 0) {
      // Show empty state, disable Clear All
      dom.emptyState.classList.remove('hidden');
      dom.clearAllBtn.setAttribute('disabled', 'disabled');
      dom.clearAllBtn.setAttribute('aria-disabled', 'true');
    } else {
      // Hide empty state, enable Clear All
      dom.emptyState.classList.add('hidden');
      dom.clearAllBtn.removeAttribute('disabled');
      dom.clearAllBtn.removeAttribute('aria-disabled');

      for (var j = 0; j < expenses.length; j++) {
        var item = expenses[j];
        var catConfig = CATEGORIES[item.category] || CATEGORIES['Other'];
        var classKey = catConfig.classKey;

        var li = document.createElement('li');
        li.className = 'expense-item';
        li.setAttribute('role', 'listitem');
        li.setAttribute('data-id', item.id);

        li.innerHTML =
          '<div class="item-left">' +
            '<div class="item-icon-box icon-' + classKey + '" aria-hidden="true">' +
              (item.icon || catConfig.icon) +
            '</div>' +
            '<div class="item-info">' +
              '<span class="item-title" title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title) + '</span>' +
              '<div class="item-meta">' +
                '<span class="category-pill pill-' + classKey + '">' + escapeHtml(item.category) + '</span>' +
                '<time class="item-time" datetime="' + new Date(item.timestamp).toISOString() + '">' +
                  formatTimestamp(item.timestamp) +
                '</time>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="item-right">' +
            '<span class="item-amount" aria-label="' + formatRupees(item.amount) + ' rupees">₹' + formatRupees(item.amount) + '</span>' +
            '<button type="button" class="delete-btn" ' +
              'title="Delete ' + escapeHtml(item.title) + '" ' +
              'aria-label="Delete expense: ' + escapeHtml(item.title) + ', ' + formatRupees(item.amount) + ' rupees" ' +
              'data-id="' + escapeHtml(item.id) + '"' +
            '>×</button>' +
          '</div>';

        fragment.appendChild(li);
      }

      dom.expenseList.appendChild(fragment);
    }
  }

  // =========================================================================
  // 11. EVENT HANDLING — Setup
  // =========================================================================

  /**
   * Attaches all event listeners using event delegation where possible.
   */
  function setupEventListeners() {
    // ---- Category Buttons: One-tap logging ----
    dom.categoryButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-category');
        selectedCategory = validateCategory(cat);
        addExpense(selectedCategory);
      });
    });

    // ---- Form Submit (primary Add button) ----
    dom.expenseForm.addEventListener('submit', function (e) {
      e.preventDefault();
      addExpense(selectedCategory);
    });

    // ---- Quick Increment Chips ----
    dom.chipButtons.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var addVal = parseFloat(chip.getAttribute('data-add'));
        if (isNaN(addVal) || addVal <= 0) return;

        var currentVal = parseFloat(dom.itemAmount.value) || 0;
        var newVal = currentVal + addVal;

        // Clamp to max
        if (newVal > MAX_AMOUNT) newVal = MAX_AMOUNT;

        dom.itemAmount.value = newVal;
        clearAmountError();
        dom.itemAmount.focus();
      });
    });

    // ---- Keyboard: Enter in title → jump to amount or submit ----
    dom.itemTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (dom.itemAmount.value.trim()) {
          addExpense(selectedCategory);
        } else {
          dom.itemAmount.focus();
        }
      }
    });

    // ---- Keyboard: Enter in amount → submit ----
    dom.itemAmount.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addExpense(selectedCategory);
      }
    });

    // ---- Clear error on amount input change ----
    dom.itemAmount.addEventListener('input', function () {
      clearAmountError();
    });

    // ---- Clear All flow ----
    dom.clearAllBtn.addEventListener('click', openClearModal);
    dom.cancelClearBtn.addEventListener('click', closeClearModal);
    dom.confirmClearBtn.addEventListener('click', clearAllExpenses);

    // ---- Close modal on backdrop click ----
    dom.confirmModal.addEventListener('click', function (e) {
      if (e.target === dom.confirmModal) {
        closeClearModal();
      }
    });

    // ---- Global keyboard handlers ----
    document.addEventListener('keydown', function (e) {
      // Close modal on Escape
      if (e.key === 'Escape' && !dom.confirmModal.classList.contains('hidden')) {
        closeClearModal();
      }
    });

    // ---- Trap focus within modal when open ----
    dom.confirmModal.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusableEls = dom.confirmModal.querySelectorAll(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableEls.length === 0) return;

      var firstEl = focusableEls[0];
      var lastEl = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    });

    // ---- Event Delegation for Delete Buttons in the expense list ----
    dom.expenseList.addEventListener('click', function (e) {
      var deleteBtn = e.target.closest('.delete-btn');
      if (!deleteBtn) return;

      e.stopPropagation();
      var expenseId = deleteBtn.getAttribute('data-id');
      var listItem = deleteBtn.closest('.expense-item');
      deleteExpense(expenseId, listItem);
    });
  }

  // =========================================================================
  // 12. INITIALIZATION
  // =========================================================================

  /**
   * Updates the date badge in the header with today's formatted date.
   */
  function updateDateDisplay() {
    if (!dom.currentDateDisplay) return;
    var now = new Date();
    dom.currentDateDisplay.textContent = now.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    dom.currentDateDisplay.setAttribute(
      'datetime',
      now.toISOString().split('T')[0]
    );
  }

  /**
   * Main initialization function. Called once when the DOM is ready.
   */
  function init() {
    cacheDomElements();
    loadExpenses();
    updateDateDisplay();
    setupEventListeners();
    render();
  }

  // Start the application when the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
