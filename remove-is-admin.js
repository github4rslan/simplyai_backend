import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'new_schema'
};

async function removeIsAdminColumn() {
  let connection;
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(config);
    
    // Check if is_admin column exists
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM profiles LIKE 'is_admin'
    `);
    
    if (columns.length > 0) {
      console.log('Removing is_admin column...');
      await connection.execute('ALTER TABLE profiles DROP COLUMN is_admin');
      console.log('✅ is_admin column removed successfully!');
      
      // Verify it's gone
      const [newColumns] = await connection.execute(`
        SHOW COLUMNS FROM profiles LIKE 'is_admin'
      `);
      
      if (newColumns.length === 0) {
        console.log('✅ Verified: is_admin column has been removed');
      }
    } else {
      console.log('❌ is_admin column not found');
    }
    
    // Show current user roles
    const [users] = await connection.execute('SELECT email, role FROM profiles LIMIT 5');
    console.log('\nCurrent user roles:', users);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

removeIsAdminColumn();
