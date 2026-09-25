'use strict';
// Configuración de esta computadora (config.json en la carpeta de datos).
//  - PC principal: { mode: 'principal', share, key, server_id }
//  - PC conectada: { mode: 'terminal', terminal_id, name, key, server: { host, port, server_id, name } }
const fs = require('fs');
const path = require('path');

const file = (dir) => path.join(dir, 'config.json');

function load(dir) {
  try {
    return JSON.parse(fs.readFileSync(file(dir), 'utf8'));
  } catch {
    return null;
  }
}

function save(dir, cfg) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file(dir) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file(dir));
  return cfg;
}

module.exports = { load, save };
