// Every public page. Keep in sync with sitemap.xml.
export const pages = ["/", "/es/", "/pt-br/", "/404.html"];
export const localized = ["/", "/es/", "/pt-br/"];

// 320 (WCAG reflow) through ultra-wide. Includes in-between widths, not only device presets.
export const widths = [320, 360, 390, 430, 600, 768, 820, 1024, 1280, 1440, 1920, 2560, 3840];

export const slug = (path) =>
  path === "/" ? "home" : path.replace(/^\/|\/$|\.html$/g, "").replace(/\W+/g, "-");
