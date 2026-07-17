// Tailwind config — shared across all pages
try {
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "primary": "#4cd7f6",
          "error-container": "#93000a",
          "on-primary-fixed-variant": "#004e5c",
          "on-tertiary-fixed-variant": "#653e00",
          "on-primary-container": "#00424f",
          "on-tertiary-container": "#563400",
          "on-primary": "#003640",
          "secondary-container": "#00a572",
          "surface-tint": "#4cd7f6",
          "surface-container-highest": "#303638",
          "primary-container": "#06b6d4",
          "tertiary": "#ffb95f",
          "secondary": "#4edea3",
          "tertiary-fixed-dim": "#ffb95f",
          "outline": "#869397",
          "on-secondary-fixed": "#002113",
          "secondary-fixed": "#6ffbbe",
          "on-primary-fixed": "#001f26",
          "inverse-surface": "#dee3e6",
          "on-error": "#690005",
          "surface-container-low": "#171d1e",
          "on-surface": "#dee3e6",
          "surface-dim": "#0e1416",
          "surface-container-high": "#252b2d",
          "on-error-container": "#ffdad6",
          "tertiary-fixed": "#ffddb8",
          "surface-variant": "#303638",
          "on-tertiary": "#472a00",
          "background": "#0e1416",
          "on-secondary-fixed-variant": "#005236",
          "on-background": "#dee3e6",
          "error": "#ffb4ab",
          "on-tertiary-fixed": "#2a1700",
          "on-surface-variant": "#bcc9cd",
          "primary-fixed": "#acedff",
          "outline-variant": "#3d494c",
          "tertiary-container": "#e79400",
          "inverse-primary": "#00687a",
          "on-secondary": "#003824",
          "inverse-on-surface": "#2b3133",
          "surface-container": "#1b2122",
          "surface-bright": "#343a3c",
          "surface-container-lowest": "#090f11",
          "primary-fixed-dim": "#4cd7f6",
          "on-secondary-container": "#00311f",
          "surface": "#0e1416",
          "secondary-fixed-dim": "#4edea3"
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
          "body-md": ["Inter"], "label-mono": ["JetBrains Mono"], "body-lg": ["Inter"]
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
