/**
 * Daily Expense & Pocket Money Tally
 * Vanilla JavaScript implementation with localStorage persistence
 */

(function () {
  'use strict';

  // Constants & Storage Key
  const STORAGE_KEY = 'pocket_money_tally_data_v1';

  // Category Configuration
  const CATEGORIES = {
    'Chai & Snacks': { icon: '☕', classKey: 'chai' },
    'Travel': { icon: '🛺', classKey: 'travel' },
    'Stationery': { icon: '📝', classKey: 'stationery' },
    'Other': { icon: '🏷️', classKey: 'other' }
  };

  // State
  let expenses = [];

  // DOM Elements
  const expenseForm = document.getElementById('expenseForm');
  const itemTitleInput = document.getElementById('itemTitle');
  const itemAmountInput = document.getElementById('itemAmount');
  const amountFieldWrapper = itemAmountInput.closest('.input-field-wrapper');
  const categoryButtons = document.querySelectorAll('.category-btn');
  const addExpenseBtn = document.getElementById('addExpenseBtn');
  const chipButtons = document.querySelectorAll('.chip-btn');
  const expenseList = document.getElementById('expenseList');
  const emptyState = document.getElementById('emptyState');
  const todayTotalEl = document.getElementById('todayTotal');
  const weekTotalEl = document.getElementById('weekTotal');
  const todayCountPill = document.getElementById('todayCountPill');
  const weekCountPill = document.getElementById('weekCountPill');
  const logCountEl = document.getElementById('logCount');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const confirmModal = document.getElementById('confirmModal');
  const cancelClearBtn = document.getElementById('cancelClearBtn');
  const confirmClearBtn = document.getElementById('confirmClearBtn');
  const toastEl = document.getElementById('toast');
  const currentDateDisplay = document.getElementById('currentDateDisplay');

  // Active category tracker (default to Chai & Snacks)
  let selectedCategory = 'Chai & Snacks';

  /**
   * Initialize Application
   */
  function init() {
    loadExpenses();
    updateDateDisplay();
    setupEventListeners();
    render();
  }

  /**
   * Update header date display
   */
  function updateDateDisplay() {
    const now = new Date();
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    if (currentDateDisplay) {
      currentDateDisplay.textContent = now.toLocaleDateString('en-IN', options);
    }
  }

  /**
   * Load expenses from localStorage
   */
  function loadExpenses() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        expenses = JSON.parse(stored);
      } else {
        expenses = [];
      }
    } catch (e) {
      console.error('Failed to parse expenses from localStorage', e);
      expenses = [];
    }
  }

  /**
   * Save expenses to localStorage
   */
  function saveExpenses() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    } catch (e) {
      console.error('Failed to save expenses to localStorage', e);
      showToast('Storage error! Unable to save.');
    }
  }

  /**
   * Date helper: Get midnight timestamp for today (local time)
   */
  function getStartOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }

  /**
   * Date helper: Get Monday 00:00:00 timestamp for current week (local time)
   */
  function getStartOfThisWeek() {
    const now = new Date();
    const day = now.getDay(); // 0 is Sunday, 1 is Monday...
    // In India/ISO, Monday is start of the week:
    // If Sunday (0), distance is 6 days back; otherwise day - 1
    const diffToMonday = day === 0 ? 6 : day - 1;

    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
  }

  /**
   * Format currency nicely
   */
  function formatRupees(amount) {
    if (isNaN(amount) || amount === null) return '0';
    return Number(amount).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
    });
  }

  /**
   * Format human-readable relative/short time
   */
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    const timeStr = date.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (isToday) {
      return `Today, ${timeStr}`;
    } else if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short'
      });
      return `${dateStr}, ${timeStr}`;
    }
  }

  /**
   * Show toast notification
   */
  let toastTimeout;
  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2400);
  }

  /**
   * Trigger visual shake on amount input if invalid
   */
  function shakeAmountInput() {
    if (!amountFieldWrapper) return;
    amountFieldWrapper.classList.remove('shake');
    // Force DOM reflow to restart CSS animation
    void amountFieldWrapper.offsetWidth;
    amountFieldWrapper.classList.add('shake');
    itemAmountInput.focus();
  }

  /**
   * Add a new expense
   * @param {string} category 
   */
  function logExpenseWithCategory(category) {
    const rawAmount = itemAmountInput.value.trim();
    const amount = parseFloat(rawAmount);

    if (!rawAmount || isNaN(amount) || amount <= 0) {
      shakeAmountInput();
      showToast('⚠️ Please enter an amount first!');
      return;
    }

    const titleInput = itemTitleInput.value.trim();
    // If title was empty, default gracefully to the category name
    const finalTitle = titleInput || category;
    const catConfig = CATEGORIES[category] || CATEGORIES['Other'];

    const newExpense = {
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: finalTitle,
      amount: amount,
      category: category,
      icon: catConfig.icon,
      timestamp: Date.now()
    };

    // Prepend to list (most recent first)
    expenses.unshift(newExpense);
    saveExpenses();
    render();

    // Reset inputs
    itemTitleInput.value = '';
    itemAmountInput.value = '';

    showToast(`✓ Added ₹${formatRupees(amount)} for ${finalTitle}`);
  }

  /**
   * Delete single expense by ID
   */
  function deleteExpense(id, element) {
    if (element) {
      element.classList.add('deleting');
      setTimeout(() => {
        expenses = expenses.filter(exp => exp.id !== id);
        saveExpenses();
        render();
        showToast('Expense removed');
      }, 200);
    } else {
      expenses = expenses.filter(exp => exp.id !== id);
      saveExpenses();
      render();
      showToast('Expense removed');
    }
  }

  /**
   * Clear all expenses
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
  }

  function openClearModal() {
    if (expenses.length === 0) {
      showToast('Spend log is already empty');
      return;
    }
    confirmModal.classList.remove('hidden');
  }

  function closeClearModal() {
    confirmModal.classList.add('hidden');
  }

  /**
   * Render UI: Running Totals + Spend List
   */
  function render() {
    const startOfToday = getStartOfToday();
    const startOfThisWeek = getStartOfThisWeek();

    let todaySum = 0;
    let todayCount = 0;
    let weekSum = 0;
    let weekCount = 0;

    expenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      if (exp.timestamp >= startOfToday) {
        todaySum += amt;
        todayCount++;
      }
      if (exp.timestamp >= startOfThisWeek) {
        weekSum += amt;
        weekCount++;
      }
    });

    // Update Totals Cards
    todayTotalEl.textContent = formatRupees(todaySum);
    weekTotalEl.textContent = formatRupees(weekSum);

    todayCountPill.textContent = `${todayCount} ${todayCount === 1 ? 'item' : 'items'}`;
    weekCountPill.textContent = `${weekCount} ${weekCount === 1 ? 'item' : 'items'}`;
    logCountEl.textContent = `${expenses.length} ${expenses.length === 1 ? 'entry' : 'entries'}`;

    // Render Recent Spend Log
    expenseList.innerHTML = '';

    if (expenses.length === 0) {
      emptyState.classList.remove('hidden');
      clearAllBtn.style.opacity = '0.5';
    } else {
      emptyState.classList.add('hidden');
      clearAllBtn.style.opacity = '1';

      expenses.forEach(item => {
        const catConfig = CATEGORIES[item.category] || CATEGORIES['Other'];
        const classKey = catConfig.classKey || 'other';

        const row = document.createElement('div');
        row.className = 'expense-item';
        row.setAttribute('data-id', item.id);

        row.innerHTML = `
          <div class="item-left">
            <div class="item-icon-box icon-${classKey}">
              ${item.icon || catConfig.icon}
            </div>
            <div class="item-info">
              <span class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
              <div class="item-meta">
                <span class="category-pill pill-${classKey}">${escapeHtml(item.category)}</span>
                <span class="item-time">${formatTimestamp(item.timestamp)}</span>
              </div>
            </div>
          </div>
          <div class="item-right">
            <span class="item-amount">₹${formatRupees(item.amount)}</span>
            <button
              type="button"
              class="delete-btn"
              title="Delete expense"
              aria-label="Delete ${escapeHtml(item.title)}"
              data-id="${item.id}"
            >×</button>
          </div>
        `;

        // Event listener for delete button
        const delBtn = row.querySelector('.delete-btn');
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteExpense(item.id, row);
        });

        expenseList.appendChild(row);
      });
    }
  }

  /**
   * Prevent XSS helper
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Set up all Event Listeners
   */
  function setupEventListeners() {
    // 1. One-Tap Category Buttons: Tap to log immediately!
    categoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category');
        selectedCategory = cat;
        logExpenseWithCategory(cat);
      });
    });

    // 2. Primary Add Button & Form Submit
    expenseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      logExpenseWithCategory(selectedCategory || 'Other');
    });

    // 3. Quick increment chip buttons
    chipButtons.forEach(chip => {
      chip.addEventListener('click', () => {
        const addVal = parseFloat(chip.getAttribute('data-add')) || 0;
        const currentVal = parseFloat(itemAmountInput.value) || 0;
        itemAmountInput.value = (currentVal + addVal);
        itemAmountInput.focus();
      });
    });

    // 4. Enter key in title jumps to amount or submits if amount already present
    itemTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (itemAmountInput.value.trim()) {
          logExpenseWithCategory(selectedCategory || 'Other');
        } else {
          itemAmountInput.focus();
        }
      }
    });

    // 5. Enter key in amount submits
    itemAmountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        logExpenseWithCategory(selectedCategory || 'Other');
      }
    });

    // 6. Clear All flow
    clearAllBtn.addEventListener('click', openClearModal);
    cancelClearBtn.addEventListener('click', closeClearModal);
    confirmClearBtn.addEventListener('click', clearAllExpenses);

    // Close modal on click outside card
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) {
        closeClearModal();
      }
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
        closeClearModal();
      }
    });
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
