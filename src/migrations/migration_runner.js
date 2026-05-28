const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Determine database path (production/staging or local)
const dbPath = process.env.NODE_ENV === 'test' 
    ? ':memory:' 
    : path.join(__dirname, '..', '..', 'users.db');

const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

console.log(`[Migrations] Using database: ${dbPath}`);
console.log(`[Migrations] Scanning folder: ${migrationsDir}`);

// Ensure migrations folder exists
if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Promised-based SQLite helpers for clean transaction flow
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function run() {
    try {
        // 1. Create migrations tracking table if not exists
        await dbRun(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                migration_name TEXT UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Read already applied migrations
        const appliedRows = await dbAll('SELECT migration_name FROM schema_migrations');
        const appliedSet = new Set(appliedRows.map(r => r.migration_name));

        // 3. Scan migrations directory
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
            .sort(); // Alphabetic order is critical

        console.log(`[Migrations] Found ${files.length} total migration files.`);

        let newMigrationsApplied = 0;

        for (const file of files) {
            if (appliedSet.has(file)) {
                continue;
            }

            console.log(`[Migrations] Applying: ${file}...`);

            // Begin transaction
            await dbRun('BEGIN TRANSACTION');

            try {
                if (file.endsWith('.sql')) {
                    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                    // SQLite doesn't support multiple queries in one run() call unless we split them or use exec()
                    // db.exec runs all SQL statements separated by semicolons in one go.
                    await new Promise((resolve, reject) => {
                        db.exec(sqlContent, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                } else if (file.endsWith('.js')) {
                    const migrationModule = require(path.join(migrationsDir, file));
                    if (typeof migrationModule.up === 'function') {
                        await migrationModule.up(db);
                    } else {
                        throw new Error(`Migration ${file} does not export an 'up' function.`);
                    }
                }

                // Record successful migration
                await dbRun('INSERT INTO schema_migrations (migration_name) VALUES (?)', [file]);
                await dbRun('COMMIT');
                
                console.log(`[Migrations] Successfully applied: ${file}`);
                newMigrationsApplied++;
            } catch (err) {
                await dbRun('ROLLBACK');
                console.error(`[Migrations] [ERROR] Failed applying ${file}. Rolled back.`);
                throw err;
            }
        }

        if (newMigrationsApplied === 0) {
            console.log('[Migrations] Database is up to date. No migrations needed.');
        } else {
            console.log(`[Migrations] Done. Applied ${newMigrationsApplied} new migration(s).`);
        }

    } catch (err) {
        console.error('[Migrations] [CRITICAL ERROR] Migrations runner failed:', err);
        process.exit(1);
    } finally {
        db.close();
    }
}

if (require.main === module) {
    run();
} else {
    module.exports = { run };
}
