-- Execute per appropriate connection before migrations/transactions.
-- state.sqlite: local disk ONLY, not network filesystem or sync folder.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
-- Disable extension loading through the driver API, not a SQL user option.
-- Verify returned PRAGMA values; do not assume every requested setting applied.
