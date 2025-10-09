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

async function updateAdminPassword() {
  let connection;
  try {
    console.log('Connessione al database...');
    connection = await mysql.createConnection(config);
    
    // Verifica se esiste la colonna password
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM profiles LIKE 'password'
    `);
    
    if (columns.length === 0) {
      console.log('❌ Colonna password non trovata nella tabella profiles');
      return;
    }
    
    const adminEmail = 'admin@simpolyai.com';
    const adminPassword = 'Admin123!';
    
    // Hash della password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Aggiorna password e assicurati che sia admin
    const [result] = await connection.execute(
      'UPDATE profiles SET password = ?, is_admin = ?, full_name = ? WHERE email = ?',
      [hashedPassword, true, 'Administrator', adminEmail]
    );
    
    if (result.affectedRows > 0) {
      console.log(`✅ Password admin aggiornata con successo!`);
      console.log(`\n🔑 Credenziali di accesso:`);
      console.log(`Email: ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
    } else {
      console.log('❌ Nessun utente trovato con l\'email specificata');
    }
    
    // Verifica l'admin
    const [adminUsers] = await connection.execute(
      'SELECT id, email, full_name, is_admin FROM profiles WHERE email = ?',
      [adminEmail]
    );
    
    if (adminUsers.length > 0) {
      console.log('\n📋 Dettagli Admin:');
      console.log(`ID: ${adminUsers[0].id}`);
      console.log(`Email: ${adminUsers[0].email}`);
      console.log(`Nome: ${adminUsers[0].full_name}`);
      console.log(`Is Admin: ${adminUsers[0].is_admin ? 'Sì' : 'No'}`);
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

updateAdminPassword();
