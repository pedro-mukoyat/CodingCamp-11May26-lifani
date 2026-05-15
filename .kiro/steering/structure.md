# Project Structure

Exactly 3 files are allowed. Do not add additional files or folders beyond this structure.

```
project-root/
├── index.html       # Single HTML entry point (root level)
├── css/
│   └── style.css    # Single stylesheet
└── js/
    └── app.js       # Single JavaScript file
```

## Rules
- `index.html` must live at the project root — not inside any subfolder
- One CSS file inside `css/` — no additional stylesheets
- One JS file inside `js/` — no additional scripts or modules
- Chart.js is loaded via CDN `<script>` tag in `index.html` `<head>` — it does not count as an extra file
- Do not create `node_modules`, `dist`, `src`, or any other directories
