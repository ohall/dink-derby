# Dink Derby

> The dumbest, greatest fishing scorekeeper on the internet.

## 🛠️ Development Workflow

### Quick Start

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Start Development Servers**
    You'll need two terminal sessions:

    **Terminal 1: Server** (API @ localhost:3000)
    ```bash
    npm run dev -w @dink-derby/server
    ```

    **Terminal 2: Client** (Web App @ localhost:5173)
    ```bash
    npm run dev -w @dink-derby/client
    ```

### 📦 Core Commands

| Command | Description |
| :--- | :--- |
| `npm install` | Installs dependencies for all workspaces. |
| `npm run build -w @dink-derby/shared-types` | Rebuilds shared types (Run this after changing Zod schemas). |
| `npm run build -w @dink-derby/client` | Builds the web client for production. |
| `npm run db:generate -w @dink-derby/server` | Generates SQL migrations from Drizzle schema. |

---

## 🏗️ Monorepo Structure

This project uses **npm workspaces**.

*   **`apps/client`** (`@dink-derby/client`)
    *   **Tech:** React, Vite, TanStack Router, Tailwind.
    *   **Data:** Local-first using **Dexie** (IndexedDB). All reads come from here.
*   **`apps/server`** (`@dink-derby/server`)
    *   **Tech:** Fastify, Node.js, Drizzle ORM.
    *   **Data:** Postgres. Handles synchronization and conflicts.
*   **`packages/shared-types`** (`@dink-derby/shared-types`)
    *   **Purpose:** Shared Zod schemas, TypeScript types, and DTOs.
    *   **Rule:** If you modify the data model, **start here**.

## 🔄 Local-First Architecture

Dink Derby works 100% offline.

1.  **Writes:** Actions (Create Derby, Log Catch) are written to IndexedDB immediately.
2.  **Sync:** A background process pushes these changes to the API when online.
3.  **Reads:** The UI **only** reads from the local IndexedDB.

For deep architectural details and "The Contract," see [AGENTS.md](./AGENTS.md).
