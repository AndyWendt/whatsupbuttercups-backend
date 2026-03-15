import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

const migrationFilePattern = /^\d{4,}_.*\.sql$/;

const withRunner = (db) => {
  if (typeof db.exec === "function") {
    return (sql) => db.exec(sql);
  }

  if (typeof db.prepare === "function") {
    return (sql) => db.prepare(sql).run();
  }

  throw new Error("Database binding must expose exec or prepare");
};

export const listMigrations = () => {
  const files = readdirSync(MIGRATION_DIR).filter((name) =>
    migrationFilePattern.test(name),
  );
  return files.sort();
};

export const loadMigrations = () =>
  listMigrations().map((fileName) => {
    const filePath = path.join(MIGRATION_DIR, fileName);
    return {
      name: fileName,
      sql: readFileSync(filePath, "utf8"),
      id: fileName,
    };
  });

export const runMigrations = async (db) => {
  const runSql = withRunner(db);
  const migrations = loadMigrations();

  for (const migration of migrations) {
    runSql(migration.sql);
  }
};
