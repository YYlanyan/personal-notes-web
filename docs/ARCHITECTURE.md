# Architecture and data boundaries

Notes runs as a local web application. The browser UI is served by a Node.js process bound to `127.0.0.1`; the process reads and writes Markdown files in the configured data root.

## Source and public content

- `app/src/` contains the React interface and editor.
- `app/server.mjs` starts the local service and registers the workspaces.
- `app/workspace.mjs` implements file operations, autosave, history, trash, image upload, and Git operations.
- `app/blog.mjs` handles the optional Hugo workflow.
- `app/tests/` contains the existing Node.js tests.
- `app/dist/` contains generated browser assets. Rebuild it with `npm run build` after changing the interface.
- `notes/`, `assets/`, and `examples/` in this repository contain only public notes, attachments, and examples intended for publication.

## Runtime data

Application source and personal data use separate roots. The standalone launcher defaults `NOTES_DATA_ROOT` to `~/NotesData`; set that variable to choose another data directory. The data root contains private `notes/`, `assets/`, the public workspace, and local recovery state. The source repository does not need to contain a user's private notes.

ImgBed settings, including the API token, are read by the server from `<NOTES_DATA_ROOT>/.local/imgbed.json`. The token is never bundled into browser assets. The `.local/` directory also stores local-only workspace settings, recovery data, and publishing state; it must not be published.

## Publishing

The repository contains the application and the Markdown under its public `notes/` directory. Before publishing a change, inspect the exact file list shown by Notes. Keep private notes, private attachments, blog content, `.local/`, and credentials out of this repository. Public publishing removes only paths managed by its saved publication manifest and preserves unrelated remote paths.

For installation and user-facing setup, see [README.md](../README.md).
