import { icon } from "./icons.js";

// Safe to call repeatedly; re-renders when data-icon changes.
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (el.dataset.iconRendered === name) return;
    el.innerHTML = icon(name);
    el.dataset.iconRendered = name;
  });
}

export function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  document.body.classList.add("modal-open");
}

export function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  if (!document.querySelector(".modal-backdrop:not(.hidden)")) {
    document.body.classList.remove("modal-open");
  }
}

// A reusable yes or no dialog. Resolves true or false, and never leaves a
// listener behind, so it is safe to call as often as you like.
export function confirmDialog({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
  const backdrop = document.getElementById("confirmModal");
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmBody").textContent = body;

  const confirmBtn = document.getElementById("confirmYes");
  const cancelBtn = document.getElementById("confirmNo");
  confirmBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;

  openModal("confirmModal");
  confirmBtn.focus();

  return new Promise((resolve) => {
    const finish = (answer) => {
      confirmBtn.removeEventListener("click", onYes);
      cancelBtn.removeEventListener("click", onNo);
      backdrop.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      closeModal("confirmModal");
      resolve(answer);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onBackdrop = (e) => {
      if (e.target === backdrop) finish(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
    };

    confirmBtn.addEventListener("click", onYes);
    cancelBtn.addEventListener("click", onNo);
    backdrop.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function banner(el, kind, message) {
  if (!message) {
    el.classList.add("hidden");
    return;
  }
  el.className = `banner ${kind}`;
  el.innerHTML = `<span data-icon="${kind === "ok" ? "check" : "alert"}"></span><span>${escapeHtml(
    message
  )}</span>`;
  hydrateIcons(el);
}

export function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
