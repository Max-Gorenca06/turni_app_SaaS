import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const password = 'mysku3-hafPaz-kyzpyv';
const projectRef = 'mrwjqeachzcmnwahnqjn';
const sqlFilePath = path.join(__dirname, 'combined_migration.sql');
const sqlQuery = fs.readFileSync(sqlFilePath, 'utf8');

const targets = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: `postgres` }
];

async function run() {
    for (const t of targets) {
        console.log(`Tentativo connessione a ${t.host}:${t.port} come ${t.user}...`);
        const client = new pg.Client({
            host: t.host,
            port: t.port,
            user: t.user,
            password: password,
            database: 'postgres',
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000
        });

        try {
            await client.connect();
            console.log("✅ CONNESSO! Esecuzione SQL...");
            await client.query(sqlQuery);
            console.log("🎉 SUCCESSO! Tabella push_subscriptions creata/aggiornata.");
            await client.end();
            return;
        } catch (err) {
            console.log(`❌ Fallito (${t.host}:${t.port}): ${err.message}`);
            await client.end().catch(() => {});
        }
    }
}

run();
