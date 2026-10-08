const toggle = document.querySelector("[data-theme-toggle]");

if (toggle) {
  toggle.addEventListener("click", () => {
    const next = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(next));
    document.documentElement.dataset.theme = next ? "dark" : "light";
  });
}
