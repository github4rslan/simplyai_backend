import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'new_schema'
};

async function createAdminSimple() {
  let connection;
  try {
    console.log('Connessione al database...');
    connection = await mysql.createConnection(config);
    
    const adminEmail = 'admin@simpolyai.com';
    const adminPassword = 'Admin123!';
    
    // Prima verifica l'admin esistente senza JOIN per evitare problemi di collation
    const [existingProfiles] = await connection.execute(
      'SELECT id FROM profiles WHERE email = ?',
      [adminEmail]
    );
    
    if (existingProfiles.length === 0) {
      console.log('❌ Admin non trovato nel profilo');
      return;
    }
    
    const userId = existingProfiles[0].id;
    console.log(`✅ Admin trovato con ID: ${userId}`);
    
    // Hash della password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Verifica se esiste nella tabella auth
    const [existingAuth] = await connection.execute(
      'SELECT id FROM auth WHERE user_id = ?',
      [userId]
    );
    
    if (existingAuth.length > 0) {
      // Aggiorna password esistente
      await connection.execute(
        'UPDATE auth SET password_hash = ?, updated_at = NOW() WHERE user_id = ?',
        [hashedPassword, userId]
      );
      console.log('✅ Password admin aggiornata');
    } else {
      // Crea nuovo record auth
      await connection.execute(
        'INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [userId, hashedPassword]
      );
      console.log('✅ Nuove credenziali auth create');
    }
    
    // Aggiorna status admin
    await connection.execute(
      'UPDATE profiles SET is_admin = ? WHERE id = ?',
      [true, userId]
    );
    console.log('✅ Status admin confermato');
    
    console.log(`\n🔑 Credenziali di accesso:`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createAdminSimple();
