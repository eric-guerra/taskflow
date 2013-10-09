# TaskFlow

A single-page task manager built with **Backbone.js** (models, collections, views, router) on top of an **Express REST API** backed by **MongoDB**.

> Portfolio reference implementation of a 2012 project, built using the Backbone 1.0 / jQuery / Underscore stack of that era.

## Features

- Quick-add with inline tags: `Plan sprint #work #q3`
- Priorities, due dates with overdue highlighting, and statuses (to do, doing, done) with `completedAt` tracking
- Inline edit (double-click), checkbox toggle, delete, and drag-and-drop reordering persisted via `/api/tasks/reorder`
- Hash routes: `#status/doing`, `#tag/work`, plus live search
- **Optimistic concurrency**: each task has a `version`, Backbone sends `If-Match`, and a stale write returns `409` with the current task so the UI can reconcile
- Server-side validation mirrored client-side; server-managed fields (`id`, `version`, timestamps) can't be overwritten
- Repository abstraction: in-memory by default, MongoDB when `MONGO_URL` is set (indexes for order, status, tags and text search; atomic version check-and-set with `findOneAndUpdate`)

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks?status=&tag=&q=` | sorted by `order` |
| POST | `/api/tasks` | 201 + Location |
| GET/PUT/PATCH/DELETE | `/api/tasks/:id` | PUT/PATCH honor `If-Match: "<version>"` |
| POST | `/api/tasks/reorder` | `{ ids: [...] }` |
| GET | `/api/stats` | counts by status and overdue |

## Run and test

```bash
npm install
npm start                       # http://localhost:3000
MONGO_URL=mongodb://localhost/taskflow npm start
npm test                        # API tests against the in-memory repo
```
