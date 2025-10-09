import { pool } from './db.js';

async function runMigration() {
  try {
    await pool.execute('ALTER TABLE profiles ADD COLUMN last_activity DATETIME NULL AFTER updated_at');
    console.log('✅ Successfully added last_activity column to profiles table');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️ Column last_activity already exists in profiles table');
    } else {
      console.error('❌ Error adding column:', error.message);
    }
  } finally {
    await pool.end();
    process.exit();
  }
}

runMigration();
