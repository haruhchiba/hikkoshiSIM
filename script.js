"use strict";

const STORAGE_KEY = "hikkoshi-cost-input-v1";

// 家賃の「◯ヶ月分」で入力する項目の初期値
const MONTH_DEFAULTS = {
  depositMonths: "1",
  reikinMonths: "1",
  brokerMonths: "1",
  advanceMonths: "1",
};

const form = document.getElementById("costForm");
const formError = document.getElementById("formError");
const advanced = document.getElementById("advancedConditions");

const inputs = {
  rent: document.getElementById("rent"),
  mgmt: document.getElementById("mgmt"),
  depositMonths: document.getElementById("depositMonths"),
  reikinMonths: document.getElementById("reikinMonths"),
  brokerMonths: document.getElementById("brokerMonths"),
  advanceMonths: document.getElementById("advanceMonths"),
  dailyRent: document.getElementById("dailyRent"),
  fireInsurance: document.getElementById("fireInsurance"),
  keyExchange: document.getElementById("keyExchange"),
  guarantor: document.getElementById("guarantor"),
  moving: document.getElementById("moving"),
  furniture: document.getElementById("furniture"),
};

const resultSection = document.getElementById("resultSection");
const rentSummary = document.getElementById("rentSummary");
const totalGrid = document.getElementById("totalGrid");
const monthsNote = document.getElementById("monthsNote");
const breakdownList = document.getElementById("breakdownList");

const copyButton = document.getElementById("copyButton");
const lineShareButton = document.getElementById("lineShareButton");
const resetButton = document.getElementById("resetButton");
const actionMessage = document.getElementById("actionMessage");

let lastResult = null;

// ---- ユーティリティ ----

function yen(value) {
  return Math.round(value).toLocaleString("ja-JP") + "円";
}

// 円の金額（0以上の整数）を読む
function parseYen(input) {
  if (!input || input.value.trim() === "") return 0;
  const num = Number(input.value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

// ヶ月数（0以上、小数可）を読む
function parseMonths(input) {
  if (!input || input.value.trim() === "") return 0;
  const num = Number(input.value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

// 「◯ヶ月分」を見やすく整形（1, 0.5, 1.5 など）
function monthLabel(months) {
  return Number(months.toFixed(2)).toString();
}

function readValues() {
  return {
    rent: parseYen(inputs.rent),
    mgmt: parseYen(inputs.mgmt),
    depositMonths: parseMonths(inputs.depositMonths),
    reikinMonths: parseMonths(inputs.reikinMonths),
    brokerMonths: parseMonths(inputs.brokerMonths),
    advanceMonths: parseMonths(inputs.advanceMonths),
    dailyRent: parseYen(inputs.dailyRent),
    fireInsurance: parseYen(inputs.fireInsurance),
    keyExchange: parseYen(inputs.keyExchange),
    guarantor: parseYen(inputs.guarantor),
    moving: parseYen(inputs.moving),
    furniture: parseYen(inputs.furniture),
    rentRaw: inputs.rent.value.trim(),
  };
}

// ---- 保存・復元 ----

function saveInput() {
  try {
    const data = {};
    Object.keys(inputs).forEach((key) => {
      data[key] = inputs[key].value;
    });
    data.advancedOpen = advanced.open;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* localStorage が使えない環境では保存しない */
  }
}

function restoreInput() {
  let restored = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      Object.keys(inputs).forEach((key) => {
        if (typeof data[key] === "string") inputs[key].value = data[key];
      });
      if (data.advancedOpen || (data.moving && data.moving !== "") ||
          (data.furniture && data.furniture !== "")) {
        advanced.open = true;
      }
      restored = true;
    }
  } catch (e) {
    /* 壊れたデータは無視 */
  }
  // 保存値がなければ、ヶ月数の初期値を入れておく
  if (!restored) {
    Object.keys(MONTH_DEFAULTS).forEach((key) => {
      if (inputs[key].value.trim() === "") {
        inputs[key].value = MONTH_DEFAULTS[key];
      }
    });
  }
}

// ---- 計算 ----

function calculate(values) {
  const { rent, mgmt } = values;

  // 家賃をもとにする項目
  const deposit = rent * values.depositMonths;
  const reikin = rent * values.reikinMonths;
  const broker = rent * values.brokerMonths;
  // 前家賃は家賃＋管理費でみる
  const advance = (rent + mgmt) * values.advanceMonths;

  // 賃貸契約の初期費用（敷金・礼金・仲介・前家賃・日割り・火災保険・鍵交換・保証会社）
  const items = [
    { key: "deposit", label: "敷金", months: values.depositMonths, value: deposit },
    { key: "reikin", label: "礼金", months: values.reikinMonths, value: reikin },
    { key: "broker", label: "仲介手数料", months: values.brokerMonths, value: broker },
    { key: "advance", label: "前家賃", months: values.advanceMonths, value: advance, withMgmt: mgmt > 0 },
    { key: "dailyRent", label: "日割り家賃", value: values.dailyRent },
    { key: "fireInsurance", label: "火災保険料", value: values.fireInsurance },
    { key: "keyExchange", label: "鍵交換費", value: values.keyExchange },
    { key: "guarantor", label: "保証会社費用", value: values.guarantor },
  ];

  const contractTotal = items.reduce((sum, item) => sum + item.value, 0);
  const extraTotal = values.moving + values.furniture;
  const grandTotal = contractTotal + extraTotal;

  // 初期費用が家賃の何ヶ月分か（契約初期費用ベース）
  const monthsRatio = rent > 0 ? contractTotal / rent : 0;

  return {
    values,
    items,
    contractTotal,
    extraTotal,
    grandTotal,
    monthsRatio,
  };
}

// ---- 描画 ----

function render(result) {
  const { values, items, contractTotal, extraTotal, grandTotal, monthsRatio } =
    result;

  rentSummary.textContent =
    `家賃 ${yen(values.rent)}` +
    (values.mgmt > 0 ? `（管理費 ${yen(values.mgmt)}）` : "") +
    " で計算しました。";

  // 合計カード
  totalGrid.innerHTML = "";
  const cards = [
    {
      tag: "賃貸契約の初期費用",
      amount: contractTotal,
      sub: "敷金・礼金・仲介手数料など",
      main: true,
    },
    {
      tag: "引っ越し・家具家電込みの総額",
      amount: grandTotal,
      sub:
        extraTotal > 0
          ? `初期費用＋${yen(extraTotal)}`
          : "引っ越し代・家具家電は未入力",
    },
  ];
  cards.forEach((c) => {
    const item = document.createElement("div");
    item.className = "total-item" + (c.main ? " is-main" : "");
    item.innerHTML = `
      <p class="total-tag">${c.tag}</p>
      <p class="total-amount">${yen(c.amount)}</p>
      <p class="total-sub">${c.sub}</p>
    `;
    totalGrid.appendChild(item);
  });

  // 家賃の何ヶ月分か
  if (values.rent > 0) {
    monthsNote.textContent = `賃貸契約の初期費用は、家賃の約 ${monthsRatio.toFixed(
      1
    )} ヶ月分です。`;
    monthsNote.hidden = false;
  } else {
    monthsNote.hidden = true;
  }

  // 内訳
  breakdownList.innerHTML = "";
  items.forEach((item) => {
    if (item.value <= 0) return;
    const li = document.createElement("li");
    let sub = "";
    if (typeof item.months === "number" && item.months > 0) {
      const base = item.withMgmt ? "家賃＋管理費" : "家賃";
      sub = `<span class="bd-sub">${base}の${monthLabel(item.months)}ヶ月分</span>`;
    }
    li.innerHTML = `
      <span class="bd-label">${item.label}${sub}</span>
      <span class="bd-value">${yen(item.value)}</span>
    `;
    breakdownList.appendChild(li);
  });

  // 契約初期費用 小計
  const subtotalLi = document.createElement("li");
  subtotalLi.className = "is-subtotal";
  subtotalLi.innerHTML = `
    <span class="bd-label">賃貸契約の初期費用 合計</span>
    <span class="bd-value">${yen(contractTotal)}</span>
  `;
  breakdownList.appendChild(subtotalLi);

  // 引っ越し代・家具家電
  if (values.moving > 0) {
    appendPlainRow("引っ越し代", values.moving);
  }
  if (values.furniture > 0) {
    appendPlainRow("家具・家電代", values.furniture);
  }

  // 総額（引っ越し代や家具家電があるときだけ強調行を出す）
  if (extraTotal > 0) {
    const totalLi = document.createElement("li");
    totalLi.className = "is-highlight";
    totalLi.innerHTML = `
      <span class="bd-label">すべて込みの総額</span>
      <span class="bd-value">${yen(grandTotal)}</span>
    `;
    breakdownList.appendChild(totalLi);
  }

  updateShareLink(result);
}

function appendPlainRow(label, value) {
  const li = document.createElement("li");
  li.innerHTML = `
    <span class="bd-label">${label}</span>
    <span class="bd-value">${yen(value)}</span>
  `;
  breakdownList.appendChild(li);
}

function buildShareText(result) {
  const { values, items, contractTotal, extraTotal, grandTotal, monthsRatio } =
    result;
  const lines = [];
  lines.push("【引っ越し初期費用シミュレーター】");
  lines.push(
    `家賃：${yen(values.rent)}` +
      (values.mgmt > 0 ? `（管理費 ${yen(values.mgmt)}）` : "")
  );
  lines.push("");
  lines.push("◆ 初期費用の内訳");
  items.forEach((item) => {
    if (item.value <= 0) return;
    let note = "";
    if (typeof item.months === "number" && item.months > 0) {
      const base = item.withMgmt ? "家賃＋管理費" : "家賃";
      note = `（${base}の${monthLabel(item.months)}ヶ月分）`;
    }
    lines.push(`・${item.label}${note}：${yen(item.value)}`);
  });
  lines.push("");
  lines.push(`◆ 賃貸契約の初期費用 合計：${yen(contractTotal)}`);
  if (values.rent > 0) {
    lines.push(`　（家賃の約${monthsRatio.toFixed(1)}ヶ月分）`);
  }
  if (extraTotal > 0) {
    if (values.moving > 0) lines.push(`・引っ越し代：${yen(values.moving)}`);
    if (values.furniture > 0) lines.push(`・家具・家電代：${yen(values.furniture)}`);
    lines.push(`◆ すべて込みの総額：${yen(grandTotal)}`);
  }
  return lines.join("\n");
}

function updateShareLink(result) {
  const text = buildShareText(result);
  lineShareButton.href =
    "https://line.me/R/msg/text/?" + encodeURIComponent(text);
}

// ---- イベント ----

function clearMessages() {
  formError.textContent = "";
  actionMessage.textContent = "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessages();

  const values = readValues();

  if (values.rentRaw === "") {
    formError.textContent = "家賃を入力してください。";
    inputs.rent.focus();
    return;
  }
  if (values.rent <= 0) {
    formError.textContent = "家賃は1円以上で入力してください。";
    inputs.rent.focus();
    return;
  }

  lastResult = calculate(values);
  render(lastResult);
  saveInput();

  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

// 入力変更で自動保存
Object.values(inputs).forEach((input) => {
  input.addEventListener("input", saveInput);
});
advanced.addEventListener("toggle", saveInput);

copyButton.addEventListener("click", async () => {
  if (!lastResult) return;
  const text = buildShareText(lastResult);
  try {
    await navigator.clipboard.writeText(text);
    actionMessage.textContent = "結果をコピーしました。";
  } catch (e) {
    // フォールバック
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      actionMessage.textContent = "結果をコピーしました。";
    } catch (err) {
      actionMessage.textContent = "コピーできませんでした。手動でコピーしてください。";
    }
    document.body.removeChild(ta);
  }
});

resetButton.addEventListener("click", () => {
  Object.values(inputs).forEach((input) => {
    input.value = "";
  });
  // ヶ月数は初期値に戻す
  Object.keys(MONTH_DEFAULTS).forEach((key) => {
    inputs[key].value = MONTH_DEFAULTS[key];
  });
  advanced.open = false;
  lastResult = null;
  resultSection.hidden = true;
  clearMessages();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    /* noop */
  }
  inputs.rent.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// 初期化
restoreInput();
