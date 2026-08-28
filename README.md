# Six-Hand Rummy (Otech)

A single-player 6-hand Rummy table — you vs. five AI opponents, two decks in
play, cumulative scoring with a 321-point elimination cap, folding, and a
menu/settings/about screen.

## Run it in VS Code

1. Open this folder in VS Code (`File → Open Folder…`).
2. Open a terminal (`` Ctrl+` `` / `` Cmd+` ``) and install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open the URL Vite prints (usually `http://localhost:5173`) in your browser.

The **Live Server**/Vite dev server supports hot reload, so edits to
`src/App.jsx` show up instantly.

## Build for production

```bash
npm run build
npm run preview   # optional: preview the production build locally
```

The production files land in `dist/`, ready to deploy anywhere that serves
static files (Netlify, Vercel, GitHub Pages, an S3 bucket, etc.).

## Project structure

```
six-hand-rummy/
├── index.html          # Vite entry HTML
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
└── src/
    ├── main.jsx         # React root
    ├── index.css        # Tailwind directives
    └── App.jsx          # The entire game: menu, settings, about, table
```

Everything — game logic, AI, scoring, and the menu/settings/about screens —
lives in `src/App.jsx` as a single component tree, so it's easy to read
top-to-bottom or split apart later if you want to grow the project.

## Recommended VS Code extensions

- **ES7+ React/Redux/React-Native snippets**
- **Tailwind CSS IntelliSense**
- **Prettier**
