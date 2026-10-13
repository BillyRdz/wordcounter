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

/*
  Airtable paste format: field labels sit on their own line with the value on
  the next line, except the value sometimes lands on the same line as the
  label, and empty fields leave several labels run together on one line.

  Labels are matched longest-first. "action" says what to do with the VALUE
  that follows the label:
    title — becomes the card title (not counted as copy)
    keep  — real copy, kept
    drop  — metadata, discarded
  "exact" labels only match when the whole line is the label — protects short
  generic words ("copy") from eating real copy lines.
*/
const LABELS = [
  { key: "content library name for new builds", action: "title" },
  { key: "content library name for existing campaigns pre new base", action: "drop" },
  { key: "content library tags", action: "drop" },
  { key: "content variant type", action: "drop" },
  { key: "push note", action: "drop" },
  { key: "deep link", action: "drop" },
  { key: "carousel screen title", action: "keep" },
  { key: "carousel title", action: "keep" },
  { key: "full screen title", action: "keep" },
  { key: "fullscreen title", action: "keep" },
  { key: "full screen body", action: "keep" },
  { key: "button 1 copy", action: "keep" },
  { key: "button 2 copy", action: "keep" },
  { key: "button 3 copy", action: "keep" },
  { key: "button copy", action: "keep" },
  { key: "copy", action: "drop", exact: true },
  { key: "title", action: "keep", exact: true },
  { key: "body", action: "keep", exact: true },
  { key: "button", action: "keep", exact: true },
].sort((a, b) => b.key.length - a.key.length);

// lowercase, strip punctuation/parens to spaces, collapse whitespace
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// If the line starts with a known label, return {label, rest-of-line}.
const matchLabel = (line) => {
  const norm = normalize(line);
  if (!norm) return null;
  for (const label of LABELS) {
    if (label.exact) {
      if (norm === label.key) return { label, rest: "" };
      // allow "Body: some copy" — exact label with an explicit colon
      const colonRe = new RegExp(
        "^\\s*" + label.key.split(" ").join("[^a-z0-9:]+") + "\\s*:\\s*",
        "i"
      );
      const m = line.match(colonRe);
      if (m) return { label, rest: line.slice(m[0].length).trim() };
      continue;
    }
    if (norm === label.key || norm.startsWith(label.key + " ")) {
      // walk the original string past the label's words to keep the value's
      // original casing/punctuation
      const words = label.key.split(" ").length;
      let seen = 0;
      let i = 0;
      let inWord = false;
      while (i < line.length && seen < words) {
        const isAlnum = /[a-z0-9]/i.test(line[i]);
        if (isAlnum && !inWord) {
          inWord = true;
        } else if (!isAlnum && inWord) {
          inWord = false;
          seen++;
        }
        i++;
        if (i === line.length && inWord) seen++;
      }
      // skip trailing punctuation/space after the label (e.g. "):", ":")
      while (i < line.length && !/[a-z0-9]/i.test(line[i])) i++;
      return { label, rest: line.slice(i).trim() };
    }
  }
  return null;
};

const parseRaw = (rawText) => {
  const lines = [];
  let title = "";
  // untagged leading lines count as copy
  let currentAction = "keep";

  for (let line of rawText.split("\n")) {
    line = line.trim();
    if (!line) continue;

    // consume one or more labels stacked at the start of the line
    // (empty Airtable fields run their labels together on one line)
    let matched = matchLabel(line);
    while (matched) {
      currentAction = matched.label.action;
      line = matched.rest;
      matched = line ? matchLabel(line) : null;
    }
    if (!line) continue;

    if (currentAction === "title") {
      if (!title) title = line;
    } else if (currentAction === "keep") {
      lines.push(line);
    }
    // drop: ignore the value
  }

  return { title, lines };
};

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
  const types = [
    ["#type-motd", "MOTD"],
    ["#type-pn", "PN"],
    ["#type-int", "INT"],
  ]
    .filter(([sel]) => document.querySelector(sel)?.checked)
    .map(([, tag]) => tag)
    .join("-");
  locOutputEl.value = `LOC - ${types} - ${month}${day}x${state.cards.length}_${totalWords}`;
};

document
  .querySelectorAll("#type-motd, #type-pn, #type-int")
  .forEach((box) => box.addEventListener("change", updateSummary));

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
  const titleInput = fragment.querySelector(".card-title");
  const titleDisplay = fragment.querySelector(".card-title-display");
  const copyTitleButton = fragment.querySelector("[data-copy-card-title]");
  const cleanOutput = fragment.querySelector(".clean-output");
  const wordCountEl = fragment.querySelector(".card-word-count");
  const lineItemsBody = fragment.querySelector(".line-items-body");
  const removeButton = fragment.querySelector(".remove-card");
  const copyCleanButton = fragment.querySelector("[data-copy-target=\".clean-output\"]");
  const copyLinesButton = fragment.querySelector("[data-copy-lines]");

  const cardData = {
    id: crypto.randomUUID(),
    title: "",
    titleEdited: false,
    lines: [],
    wordCount: 0,
    element: cardEl,
  };

  const syncTitleDisplay = () => {
    titleDisplay.textContent = cardData.title ? ` — ${cardData.title}` : "";
  };

  const updateCard = () => {
    const { title, lines } = parseRaw(rawInput.value);
    cardData.lines = lines;
    // auto-fill the title from the paste unless the user typed their own
    if (!cardData.titleEdited) {
      cardData.title = title;
      titleInput.value = title;
    }
    syncTitleDisplay();
    cleanOutput.value = lines.join("\n");
    cardData.wordCount = wordCount(cleanOutput.value);
    wordCountEl.textContent = cardData.wordCount;
    renderLineItems(cardData, lineItemsBody);
    updateSummary();
  };

  rawInput.addEventListener("input", updateCard);

  titleInput.addEventListener("input", () => {
    cardData.titleEdited = titleInput.value.trim().length > 0;
    cardData.title = titleInput.value.trim();
    syncTitleDisplay();
    updateSummary();
  });

  copyTitleButton.addEventListener("click", () => {
    copyToClipboard(titleInput.value, copyTitleButton);
  });

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
