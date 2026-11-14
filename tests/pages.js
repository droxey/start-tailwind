// Every page. "/" is the Fire Sale dashboard, "/404.html" the static not-found page.
export const pages = ["/", "/404.html"];

// Pages whose content is static, so pixel baselines are stable. The dashboard shows live data
// and dates, so it gets layout and a11y checks but no screenshot baseline.
export const staticPages = ["/404.html"];

// 320 (WCAG reflow) through ultra-wide. Includes in-between widths, not only device presets.
export const widths = [320, 360, 390, 430, 600, 768, 820, 1024, 1280, 1440, 1920, 2560, 3840];

// iPhone Pro Max class phones (the dashboard's primary target).
export const phone = { width: 440, height: 956 };

export const slug = (path) =>
  path === "/" ? "home" : path.replace(/^\/|\/$|\.html$/g, "").replace(/\W+/g, "-");
