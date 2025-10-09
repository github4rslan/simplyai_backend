import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'new_schema'
};

async function createAdminUser() {
  let connection;
  try {
    console.log('Connessione al database...');
    connection = await mysql.createConnection(config);
    
    const adminEmail = 'admin@simpolyai.com';
    const adminPassword = 'Admin123!';
    
    // Verifica se l'admin esiste già nella tabella profiles
    const [existingProfiles] = await connection.execute(
      'SELECT id FROM profiles WHERE email = ?',
      [adminEmail]
    );
    
    let userId;
    
    if (existingProfiles.length > 0) {
      userId = existingProfiles[0].id;
      console.log(`✅ Profilo admin trovato con ID: ${userId}`);
      
      // Aggiorna lo status admin
      await connection.execute(
        'UPDATE profiles SET is_admin = ?, full_name = ? WHERE id = ?',
        [true, 'Administrator', userId]
      );
      console.log('✅ Status admin aggiornato nel profilo');
    } else {
      // Crea nuovo profilo admin
      userId = uuidv4();
      await connection.execute(
        'INSERT INTO profiles (id, email, full_name, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [userId, adminEmail, 'Administrator', true]
      );
      console.log(`✅ Nuovo profilo admin creato con ID: ${userId}`);
    }
    
    // Hash della password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Verifica se esiste già nella tabella auth
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
      console.log('✅ Password admin aggiornata nella tabella auth');
    } else {
      // Crea nuovo record auth
      await connection.execute(
        'INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [userId, hashedPassword]
      );
      console.log('✅ Nuove credenziali auth create');
    }
    
    // Verifica il risultato finale
    const [finalCheck] = await connection.execute(`
      SELECT p.id, p.email, p.full_name, p.is_admin, a.id as auth_id
      FROM profiles p 
      LEFT JOIN auth a ON p.id = a.user_id 
      WHERE p.email = ?
    `, [adminEmail]);
    
    if (finalCheck.length > 0) {
      const admin = finalCheck[0];
      console.log('\n📋 Verifica Admin Creato:');
      console.log(`ID Profilo: ${admin.id}`);
      console.log(`Email: ${admin.email}`);
      console.log(`Nome: ${admin.full_name}`);
      console.log(`Is Admin: ${admin.is_admin ? 'Sì' : 'No'}`);
      console.log(`Auth ID: ${admin.auth_id ? admin.auth_id : 'Non trovato'}`);
      console.log(`\n🔑 Credenziali di accesso:`);
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createAdminUser();
