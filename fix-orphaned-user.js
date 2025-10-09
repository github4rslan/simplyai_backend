import { pool } from './db.js';
import bcrypt from 'bcryptjs';

async function fixOrphanedUser() {
  try {
    const email = 'hasindus48@gmail.com';
    const userId = '7bdd3174-3744-4e3f-ae92-2d005d7796e6';
    
    console.log(`Fixing orphaned user: ${email}`);
    
    // Check if the user already has an auth record (shouldn't, but let's be safe)
    const [existingAuth] = await pool.execute('SELECT user_id FROM auth WHERE user_id = ?', [userId]);
    
    if (existingAuth.length > 0) {
      console.log('❓ User already has an auth record, no fix needed');
      process.exit(0);
    }
    
    // Create a temporary password (user will need to reset it)
    const tempPassword = 'TempPass123!';
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);
    
    // Create the missing auth record
    await pool.execute(
      'INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
      [userId, hashedPassword]
    );
    
    console.log('✅ Auth record created successfully!');
    console.log('📧 User email:', email);
    console.log('🔑 Temporary password:', tempPassword);
    console.log('⚠️  User should change password after login');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing user:', error);
    process.exit(1);
  }
}

fixOrphanedUser();
