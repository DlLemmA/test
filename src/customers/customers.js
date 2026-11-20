// customers.js — Customer data layer
import { sql } from '../core/db.js';

export function customerList() {
  return sql('SELECT * FROM customers ORDER BY is_self DESC, name');
}