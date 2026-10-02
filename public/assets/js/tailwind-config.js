// Tailwind config — shared across all pages
try {
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "primary": "var(--color-primary)",
          "error-container": "var(--color-error-container)",
          "on-primary-fixed-variant": "var(--color-on-primary-fixed-variant)",
          "on-tertiary-fixed-variant": "var(--color-on-tertiary-fixed-variant)",
          "on-primary-container": "var(--color-on-primary-container)",
          "on-tertiary-container": "var(--color-on-tertiary-container)",
          "on-primary": "var(--color-on-primary)",
          "secondary-container": "var(--color-secondary-container)",
          "surface-tint": "var(--color-surface-tint)",
          "surface-container-highest": "var(--color-surface-container-highest)",
          "primary-container": "var(--color-primary-container)",
          "tertiary": "var(--color-tertiary)",
          "secondary": "var(--color-secondary)",
          "tertiary-fixed-dim": "var(--color-tertiary-fixed-dim)",
          "outline": "var(--color-outline)",
          "on-secondary-fixed": "var(--color-on-secondary-fixed)",
          "secondary-fixed": "var(--color-secondary-fixed)",
          "on-primary-fixed": "var(--color-on-primary-fixed)",
          "inverse-surface": "var(--color-inverse-surface)",
          "on-error": "var(--color-on-error)",
          "surface-container-low": "var(--color-surface-container-low)",
          "on-surface": "var(--color-on-surface)",
          "surface-dim": "var(--color-surface-dim)",
          "surface-container-high": "var(--color-surface-container-high)",
          "on-error-container": "var(--color-on-error-container)",
          "tertiary-fixed": "var(--color-tertiary-fixed)",
          "surface-variant": "var(--color-surface-variant)",
          "on-tertiary": "var(--color-on-tertiary)",
          "background": "var(--color-background)",
          "on-secondary-fixed-variant": "var(--color-on-secondary-fixed-variant)",
          "on-background": "var(--color-on-background)",
          "error": "var(--color-error)",
          "on-tertiary-fixed": "var(--color-on-tertiary-fixed)",
          "on-surface-variant": "var(--color-on-surface-variant)",
          "primary-fixed": "var(--color-primary-fixed)",
          "outline-variant": "var(--color-outline-variant)",
          "tertiary-container": "var(--color-tertiary-container)",
          "inverse-primary": "var(--color-inverse-primary)",
          "on-secondary": "var(--color-on-secondary)",
          "inverse-on-surface": "var(--color-inverse-on-surface)",
          "surface-container": "var(--color-surface-container)",
          "surface-bright": "var(--color-surface-bright)",
          "surface-container-lowest": "var(--color-surface-container-lowest)",
          "primary-fixed-dim": "var(--color-primary-fixed-dim)",
          "on-secondary-container": "var(--color-on-secondary-container)",
          "surface": "var(--color-surface)",
          "secondary-fixed-dim": "var(--color-secondary-fixed-dim)"
        },
        borderRadius: {
          DEFAULT: "0.125rem", lg: "0.25rem", xl: "0.5rem", full: "0.75rem"
        },
        spacing: {
          "margin-desktop": "32px", "margin-mobile": "16px",
          "sidebar-width": "260px", gutter: "16px", base: "4px"
        },
        fontFamily: {
          "headline-lg": ["Inter"], "headline-lg-mobile": ["Inter"],
          "headline-md": ["Inter"], "display": ["Inter"],
          "body-md": ["Inter"], "label-mono": ["Inter"], "body-lg": ["Inter"]
        },
        fontSize: {
          "headline-lg": ["24px", { lineHeight: "32px", fontWeight: "600" }],
          "headline-lg-mobile": ["20px", { lineHeight: "28px", fontWeight: "600" }],
          "headline-md": ["20px", { lineHeight: "28px", fontWeight: "600" }],
          "display": ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "700" }],
          "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
          "label-mono": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "500" }],
          "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }]
        }
      }
    }
  }
} catch (_e) { }
