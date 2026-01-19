const cardContainer = document.querySelector("#cards");
const addCardButton = document.querySelector("#add-card");
const totalWordCountEl = document.querySelector("#total-word-count");
const totalCardCountEl = document.querySelector("#total-card-count");
const combinedCopyEl = document.querySelector("#combined-copy");
const locOutputEl = document.querySelector("#loc-output");
const toast = document.querySelector("#toast");
const cardTemplate = document.querySelector("#card-template");

const state = {
  cards: [],
};

const KEY_SYNONYMS = [
  "full-screen title",
  "fullscreen title",
  "full screen title",
  "carousel-screen title",
  "carousel screen title",
  "carousel title",
  "title",
  "body",
  "button",
];

const normalizeKey = (key) => key.toLowerCase().trim();

const extractValue = (line) => {
  if (!line.includes(":")) {
    return line.trim();
  }
  const [key, ...rest] = line.split(":");
  const value = rest.join(":").trim();
  const normalized = normalizeKey(key);
  if (KEY_SYNONYMS.includes(normalized)) {
    return value;
  }
  return value || key.trim();
};

const parseLines = (rawText) =>
  rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => extractValue(line))
    .filter(Boolean);

const wordCount = (text) => {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
};

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
};

const copyToClipboard = async (text, button) => {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      button.classList.add("copied");
      const original = button.textContent;
      button.textContent = "Copied!";
      window.setTimeout(() => {
        button.classList.remove("copied");
        button.textContent = original;
      }, 1200);
    }
    showToast("Copied to clipboard");
  } catch (error) {
    showToast("Copy failed. Please try again.");
  }
};

const updateSummary = () => {
  const totalWords = state.cards.reduce((acc, card) => acc + card.wordCount, 0);
  const combinedCopy = state.cards
    .map((card) => card.lines.join("\n"))
    .filter(Boolean)
    .join("\n\n");
  totalWordCountEl.textContent = totalWords;
  totalCardCountEl.textContent = state.cards.length;
  combinedCopyEl.value = combinedCopy;

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  locOutputEl.value = `LOC - MOTD - ${month}${day}x${state.cards.length}_${totalWords}`;
};

const renderLineItems = (card, container) => {
  container.innerHTML = "";
  if (card.lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Paste copy above to see each line here.";
    container.appendChild(empty);
    return;
  }

  card.lines.forEach((line) => {
    const item = document.createElement("div");
    item.className = "line-item";

    const text = document.createElement("span");
    text.textContent = line;

    const button = document.createElement("button");
    button.className = "btn small";
    button.type = "button";
    button.textContent = "Copy line";
    button.addEventListener("click", () => copyToClipboard(line, button));

    item.appendChild(text);
    item.appendChild(button);
    container.appendChild(item);
  });
};

const buildCard = () => {
  const fragment = cardTemplate.content.cloneNode(true);
  const cardEl = fragment.querySelector(".card");
  const indexEl = fragment.querySelector(".card-index");
  const rawInput = fragment.querySelector(".raw-input");
  const cleanOutput = fragment.querySelector(".clean-output");
  const wordCountEl = fragment.querySelector(".card-word-count");
  const lineItemsBody = fragment.querySelector(".line-items-body");
  const removeButton = fragment.querySelector(".remove-card");
  const copyCleanButton = fragment.querySelector("[data-copy-target=\".clean-output\"]");
  const copyLinesButton = fragment.querySelector("[data-copy-lines]");

  const cardData = {
    id: crypto.randomUUID(),
    lines: [],
    wordCount: 0,
    element: cardEl,
  };

  const updateCard = () => {
    const lines = parseLines(rawInput.value);
    cardData.lines = lines;
    cleanOutput.value = lines.join("\n");
    cardData.wordCount = wordCount(cleanOutput.value);
    wordCountEl.textContent = cardData.wordCount;
    renderLineItems(cardData, lineItemsBody);
    updateSummary();
  };

  rawInput.addEventListener("input", updateCard);

  copyCleanButton.addEventListener("click", () => {
    copyToClipboard(cleanOutput.value, copyCleanButton);
  });

  copyLinesButton.addEventListener("click", () => {
    copyToClipboard(cardData.lines.join("\n"), copyLinesButton);
  });

  removeButton.addEventListener("click", () => {
    if (state.cards.length === 1) {
      showToast("At least one card must remain.");
      return;
    }
    state.cards = state.cards.filter((card) => card.id !== cardData.id);
    cardEl.remove();
    updateCardIndexes();
    updateSummary();
  });

  updateCard();

  state.cards.push(cardData);
  cardContainer.appendChild(fragment);
  updateCardIndexes();
  updateSummary();
};

const updateCardIndexes = () => {
  const cards = document.querySelectorAll(".card");
  cards.forEach((cardEl, index) => {
    const indexEl = cardEl.querySelector(".card-index");
    indexEl.textContent = index + 1;
  });
};

addCardButton.addEventListener("click", () => {
  buildCard();
});

const handleCopyButtons = () => {
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetSelector = button.getAttribute("data-copy-target");
      const target = document.querySelector(targetSelector);
      if (target) {
        copyToClipboard(target.value || target.textContent, button);
      }
    });
  });
};

handleCopyButtons();
buildCard();
