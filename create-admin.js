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

async function createAdmin() {
  let connection;
  try {
    console.log('Connessione al database...');
    connection = await mysql.createConnection(config);
    
    // Dettagli admin
    const adminEmail = 'admin@simpolyai.com';
    const adminPassword = 'Admin123!';
    const adminName = 'Admin';
    
    // Verifica se l'admin esiste già
    const [existingUsers] = await connection.execute(
      'SELECT id FROM profiles WHERE email = ?',
      [adminEmail]
    );
    
    if (existingUsers.length > 0) {
      console.log('Admin già esistente, aggiornamento dello status admin...');
      
      // Aggiorna lo status admin
      await connection.execute(
        'UPDATE profiles SET is_admin = ? WHERE email = ?',
        [true, adminEmail]
      );
      
      console.log(`✅ Status admin aggiornato per ${adminEmail}`);
    } else {
      console.log('Creazione nuovo utente admin...');
      
      // Hash della password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // Inserisci nuovo admin
      const [result] = await connection.execute(
        'INSERT INTO profiles (email, password, name, is_admin, created_at) VALUES (?, ?, ?, ?, NOW())',
        [adminEmail, hashedPassword, adminName, true]
      );
      
      console.log(`✅ Admin creato con successo! ID: ${result.insertId}`);
    }
    
    // Verifica l'admin creato
    const [adminUsers] = await connection.execute(
      'SELECT id, email, name, is_admin FROM profiles WHERE email = ?',
      [adminEmail]
    );
    
    if (adminUsers.length > 0) {
      console.log('\n📋 Dettagli Admin:');
      console.log(`ID: ${adminUsers[0].id}`);
      console.log(`Email: ${adminUsers[0].email}`);
      console.log(`Nome: ${adminUsers[0].name}`);
      console.log(`Is Admin: ${adminUsers[0].is_admin ? 'Sì' : 'No'}`);
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

createAdmin();
