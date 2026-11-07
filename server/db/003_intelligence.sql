CREATE TABLE ai_threads (id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE ai_runs (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX ai_runs_thread ON ai_runs(thread_id,created_at);
CREATE TABLE scanner_runs (id TEXT PRIMARY KEY,symbol TEXT NOT NULL,exchange TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX scanner_recent ON scanner_runs(created_at DESC);
