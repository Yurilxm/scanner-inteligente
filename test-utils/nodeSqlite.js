// Imita a API sincrona do expo-sqlite sobre o SQLite embutido do Node (node:sqlite),
// para testes que precisam rodar SQL de verdade. Cada nome de banco vira um banco em memoria
// que sobrevive a closeSync(), como um arquivo no aparelho; deleteDatabaseSync o descarta.
const { DatabaseSync } = require('node:sqlite');

const databases = new Map();

function plain(row) {
  return row ? { ...row } : row;
}

function wrap(name) {
  const db = databases.get(name);
  return {
    execSync: sql => db.exec(sql),
    runSync: (sql, ...params) => db.prepare(sql).run(...params),
    getFirstSync: (sql, ...params) => plain(db.prepare(sql).get(...params)) ?? null,
    getAllSync: (sql, ...params) => db.prepare(sql).all(...params).map(plain),
    closeSync: () => {},
  };
}

module.exports = {
  openDatabaseSync: jest.fn(name => {
    if (!databases.has(name)) databases.set(name, new DatabaseSync(':memory:'));
    return wrap(name);
  }),
  deleteDatabaseSync: jest.fn(name => {
    if (!databases.has(name)) throw new Error(`Database ${name} not found`);
    databases.get(name).close();
    databases.delete(name);
  }),
  __databases: databases,
};
