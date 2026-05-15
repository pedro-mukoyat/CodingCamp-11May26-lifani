/**
 * Expense & Budget Visualizer
 * Vanilla JS — LocalStorage only, no frameworks
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY       = 'ebv_transactions';
const LIMIT_STORAGE_KEY = 'ebv_spend_limit';

const CATEGORY_COLORS = {
  Food:      '#f59e0b',
  Transport: '#3b82f6',
  Fun:       '#ec4899',
};

// ─── DOM References ───────────────────────────────────────────────────────────

const form             = document.getElementById('transaction-form');
const inputName        = document.getElementById('item-name');
const inputAmount      = document.getElementById('amount');
const inputCategory    = document.getElementById('category');
const balanceDisplay   = document.getElementById('balance-amount');
const transactionList  = document.getElementById('transaction-list');
const chartCanvas      = document.getElementById('expense-chart');
const sortSelect       = document.getElementById('sort-select');
const spendLimitInput  = document.getElementById('spend-limit');
const monthlySummaryEl = document.getElementById('monthly-summary');

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {Chart|null} */
let pieChart = null;

// ─── LocalStorage Helpers ─────────────────────────────────────────────────────

/**
 * Load transactions array from LocalStorage.
 * Each transaction: { id, name, amount, category, date (ISO string) }
 * @returns {{ id: string, name: string, amount: number, category: string, date: string }[]}
 */
function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist transactions array to LocalStorage.
 * @param {{ id: string, name: string, amount: number, category: string, date: string }[]} transactions
 */
function saveTransactions(transactions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/**
 * Load the saved spend limit (0 = disabled).
 * @returns {number}
 */
function loadSpendLimit() {
  const raw = localStorage.getItem(LIMIT_STORAGE_KEY);
  const val = parseFloat(raw);
  return isNaN(val) || val <= 0 ? 0 : val;
}

/**
 * Persist the spend limit.
 * @param {number} limit
 */
function saveSpendLimit(limit) {
  localStorage.setItem(LIMIT_STORAGE_KEY, String(limit));
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a number as Indonesian Rupiah.
 * @param {number} value
 * @returns {string}
 */
function formatRupiah(value) {
  return 'Rp ' + value.toLocaleString('id-ID');
}

/**
 * Format an ISO date string as "Month YYYY" (e.g. "May 2026").
 * @param {string} isoDate
 * @returns {string}
 */
function formatMonthYear(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Return a sortable "YYYY-MM" key from an ISO date string.
 * @param {string} isoDate
 * @returns {string}
 */
function toMonthKey(isoDate) {
  return isoDate.slice(0, 7); // "2026-05"
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate form inputs. Returns an error message string or null if valid.
 * @param {string} name
 * @param {string} amountRaw
 * @param {string} category
 * @returns {string|null}
 */
function validate(name, amountRaw, category) {
  if (!name.trim()) {
    return 'Item Name cannot be empty.';
  }
  if (!amountRaw || amountRaw.trim() === '') {
    return 'Amount cannot be empty.';
  }
  const amount = Number(amountRaw);
  if (isNaN(amount) || amount <= 0) {
    return 'Amount must be a positive number.';
  }
  if (!category) {
    return 'Please select a category.';
  }
  return null;
}

/**
 * Show or clear an inline validation error below the form.
 * @param {string|null} message
 */
function setFormError(message) {
  let errorEl = document.getElementById('form-error');

  if (!message) {
    if (errorEl) errorEl.remove();
    return;
  }

  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.id = 'form-error';
    errorEl.setAttribute('role', 'alert');
    errorEl.style.cssText = [
      'color: #ef4444',
      'font-size: 0.85rem',
      'margin-top: -0.5rem',
      'margin-bottom: 0.75rem',
    ].join(';');
    form.insertBefore(errorEl, form.querySelector('button[type="submit"]'));
  }

  errorEl.textContent = message;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Return a sorted copy of transactions based on the current sort-select value.
 * @param {{ id: string, name: string, amount: number, category: string, date: string }[]} transactions
 * @returns {typeof transactions}
 */
function applySorting(transactions) {
  const mode = sortSelect.value;
  const copy = [...transactions];

  switch (mode) {
    case 'newest':
      return copy.reverse(); // stored oldest-first, so reverse = newest first
    case 'oldest':
      return copy;           // stored in insertion order (oldest first)
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return copy.reverse();
  }
}

// ─── Render: Balance ──────────────────────────────────────────────────────────

/**
 * Recalculate total spend and update the balance display.
 * @param {{ amount: number }[]} transactions
 */
function renderBalance(transactions) {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  balanceDisplay.textContent = formatRupiah(total);
}

// ─── Render: Transaction List ─────────────────────────────────────────────────

/**
 * Build and inject the full transaction list into the DOM.
 * Applies current sort order and over-limit highlighting.
 * @param {{ id: string, name: string, amount: number, category: string, date: string }[]} transactions
 */
function renderList(transactions) {
  transactionList.innerHTML = '';

  const limit  = loadSpendLimit();
  const sorted = applySorting(transactions);

  sorted.forEach((t) => {
    const isOverLimit = limit > 0 && t.amount > limit;

    const li = document.createElement('li');
    if (isOverLimit) li.classList.add('over-limit');

    // Info block
    const info = document.createElement('div');
    info.className = 'transaction-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'transaction-name';
    nameEl.textContent = t.name;

    const catEl = document.createElement('span');
    catEl.className = `transaction-category category-${t.category.toLowerCase()}`;
    catEl.textContent = t.category;

    info.appendChild(nameEl);
    info.appendChild(catEl);

    // Amount
    const amountEl = document.createElement('span');
    amountEl.className = 'transaction-amount';
    amountEl.textContent = formatRupiah(t.amount);

    // Over-limit badge
    if (isOverLimit) {
      const badge = document.createElement('span');
      badge.className = 'over-limit-badge';
      badge.setAttribute('aria-label', 'Exceeds spend limit');
      badge.textContent = '⚠ Over limit';
      li.appendChild(info);
      li.appendChild(amountEl);
      li.appendChild(badge);
    } else {
      li.appendChild(info);
      li.appendChild(amountEl);
    }

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'transaction-delete';
    deleteBtn.setAttribute('aria-label', `Delete ${t.name}`);
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => handleDelete(t.id));
    li.appendChild(deleteBtn);

    transactionList.appendChild(li);
  });
}

// ─── Render: Pie Chart ────────────────────────────────────────────────────────

/**
 * Build per-category totals and update (or create) the Chart.js pie chart.
 * @param {{ amount: number, category: string }[]} transactions
 */
function renderChart(transactions) {
  const totals = {};
  transactions.forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map((l) => CATEGORY_COLORS[l] || '#94a3b8');

  if (pieChart) {
    pieChart.data.labels                      = labels;
    pieChart.data.datasets[0].data            = data;
    pieChart.data.datasets[0].backgroundColor = colors;
    pieChart.update();
  } else {
    pieChart = new Chart(chartCanvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 16,
              font: { size: 13 },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const value = ctx.parsed;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return ` ${formatRupiah(value)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }
}

// ─── Render: Monthly Summary ──────────────────────────────────────────────────

/**
 * Group transactions by "YYYY-MM", then render a summary table showing
 * total spend and per-category breakdown for each month.
 * @param {{ amount: number, category: string, date: string }[]} transactions
 */
function renderMonthlySummary(transactions) {
  if (transactions.length === 0) {
    monthlySummaryEl.innerHTML = '<p class="monthly-empty">No transactions to summarise yet.</p>';
    return;
  }

  // Group by month key, newest month first
  /** @type {Map<string, { amount: number, category: string }[]>} */
  const byMonth = new Map();

  transactions.forEach((t) => {
    const key = toMonthKey(t.date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(t);
  });

  // Sort month keys descending (newest first)
  const sortedKeys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  const table = document.createElement('table');
  table.className = 'monthly-table';
  table.setAttribute('aria-label', 'Monthly spending summary');

  // Table head
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col">Month</th>
      <th scope="col">Food</th>
      <th scope="col">Transport</th>
      <th scope="col">Fun</th>
      <th scope="col">Total</th>
    </tr>`;
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');
  let grandTotal = 0;
  const grandCats = { Food: 0, Transport: 0, Fun: 0 };

  sortedKeys.forEach((key) => {
    const items = byMonth.get(key);
    const cats  = { Food: 0, Transport: 0, Fun: 0 };
    let monthTotal = 0;

    items.forEach((t) => {
      if (cats[t.category] !== undefined) cats[t.category] += t.amount;
      monthTotal += t.amount;
    });

    grandTotal += monthTotal;
    Object.keys(grandCats).forEach((c) => { grandCats[c] += cats[c]; });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatMonthYear(key + '-01')}</td>
      <td>${cats.Food      > 0 ? formatRupiah(cats.Food)      : '—'}</td>
      <td>${cats.Transport > 0 ? formatRupiah(cats.Transport) : '—'}</td>
      <td>${cats.Fun       > 0 ? formatRupiah(cats.Fun)       : '—'}</td>
      <td>${formatRupiah(monthTotal)}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  // Table foot — grand totals
  const tfoot = document.createElement('tfoot');
  tfoot.innerHTML = `
    <tr>
      <td>All time</td>
      <td>${grandCats.Food      > 0 ? formatRupiah(grandCats.Food)      : '—'}</td>
      <td>${grandCats.Transport > 0 ? formatRupiah(grandCats.Transport) : '—'}</td>
      <td>${grandCats.Fun       > 0 ? formatRupiah(grandCats.Fun)       : '—'}</td>
      <td>${formatRupiah(grandTotal)}</td>
    </tr>`;
  table.appendChild(tfoot);

  monthlySummaryEl.innerHTML = '';
  monthlySummaryEl.appendChild(table);
}

// ─── Master Render ────────────────────────────────────────────────────────────

/**
 * Re-render all UI components from the current LocalStorage state.
 */
function renderAll() {
  const transactions = loadTransactions();
  renderBalance(transactions);
  renderList(transactions);
  renderChart(transactions);
  renderMonthlySummary(transactions);
}

// ─── Event: Form Submit ───────────────────────────────────────────────────────

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const name      = inputName.value;
  const amountRaw = inputAmount.value;
  const category  = inputCategory.value;

  const error = validate(name, amountRaw, category);
  if (error) {
    setFormError(error);
    return;
  }

  setFormError(null);

  const newTransaction = {
    id:       crypto.randomUUID(),
    name:     name.trim(),
    amount:   Number(amountRaw),
    category,
    date:     new Date().toISOString(),
  };

  const transactions = loadTransactions();
  transactions.push(newTransaction);
  saveTransactions(transactions);

  form.reset();
  renderAll();
});

// ─── Event: Delete ────────────────────────────────────────────────────────────

/**
 * Remove a transaction by id, persist, and re-render.
 * @param {string} id
 */
function handleDelete(id) {
  const transactions = loadTransactions().filter((t) => t.id !== id);
  saveTransactions(transactions);
  renderAll();
}

// ─── Event: Sort ─────────────────────────────────────────────────────────────

sortSelect.addEventListener('change', renderAll);

// ─── Event: Spend Limit ───────────────────────────────────────────────────────

spendLimitInput.addEventListener('change', () => {
  const val = parseFloat(spendLimitInput.value);
  saveSpendLimit(isNaN(val) || val <= 0 ? 0 : val);
  renderAll();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

// Restore saved spend limit into the input on page load
const savedLimit = loadSpendLimit();
if (savedLimit > 0) spendLimitInput.value = savedLimit;

renderAll();
