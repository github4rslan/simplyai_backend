import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function createAdminUser() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔧 Creating admin user...');
    
    const adminEmail = 'admin@simpolyai.com';
    const adminPassword = 'Admin123!';
    const firstName = 'Admin';
    const lastName = 'User';
    
    // Check if admin user already exists
    const [existingUsers] = await connection.execute(
      'SELECT id, role FROM profiles WHERE email = ?',
      [adminEmail]
    );
    
    let userId;
    
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`✅ Admin user found with ID: ${userId}`);
      
      // Update role to administrator
      await connection.execute(
        'UPDATE profiles SET role = ?, first_name = ?, last_name = ?, full_name = ?, updated_at = NOW() WHERE id = ?',
        ['administrator', firstName, lastName, `${firstName} ${lastName}`, userId]
      );
      console.log('✅ Admin role updated in profiles table');
      
    } else {
      // Create new admin user
      userId = uuidv4();
      await connection.execute(
        'INSERT INTO profiles (id, email, first_name, last_name, full_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, adminEmail, firstName, lastName, `${firstName} ${lastName}`, 'administrator']
      );
      console.log(`✅ New admin profile created with ID: ${userId}`);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    // Check if auth record exists
    const [existingAuth] = await connection.execute(
      'SELECT id FROM auth WHERE user_id = ?',
      [userId]
    );
    
    if (existingAuth.length > 0) {
      // Update existing password
      await connection.execute(
        'UPDATE auth SET password_hash = ?, updated_at = NOW() WHERE user_id = ?',
        [hashedPassword, userId]
      );
      console.log('✅ Admin password updated in auth table');
    } else {
      // Create new auth record
      await connection.execute(
        'INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [userId, hashedPassword]
      );
      console.log('✅ New admin auth record created');
    }
    
    // Get default free plan for admin subscription
    const [plans] = await connection.execute(
      'SELECT id FROM subscription_plans WHERE is_free = true OR price = 0 ORDER BY created_at ASC LIMIT 1'
    );
    
    if (plans.length > 0) {
      const defaultPlanId = plans[0].id;
      
      // Check if subscription exists
      const [existingSub] = await connection.execute(
        'SELECT id FROM user_subscriptions WHERE user_id = ?',
        [userId]
      );
      
      if (existingSub.length === 0) {
        // Create subscription for admin
        await connection.execute(
          'INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())',
          [uuidv4(), userId, defaultPlanId, 'active']
        );
        console.log('✅ Admin subscription created');
      }
    }
    
    // Final verification
    const [finalCheck] = await connection.execute(`
      SELECT p.id, p.email, p.first_name, p.last_name, p.role, a.id as auth_id,
             us.plan_id, sp.name as plan_name
      FROM profiles p 
      LEFT JOIN auth a ON p.id = a.user_id 
      LEFT JOIN user_subscriptions us ON p.id = us.user_id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE p.email = ?
    `, [adminEmail]);
    
    if (finalCheck.length > 0) {
      const admin = finalCheck[0];
      console.log('\n📋 Admin User Created Successfully:');
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`👤 Profile ID: ${admin.id}`);
      console.log(`📧 Email: ${admin.email}`);
      console.log(`👨‍💼 Name: ${admin.first_name} ${admin.last_name}`);
      console.log(`🔐 Role: ${admin.role}`);
      console.log(`🔑 Auth ID: ${admin.auth_id ? admin.auth_id : 'Not found'}`);
      console.log(`📋 Plan: ${admin.plan_name || 'No plan assigned'}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`\n🔑 Login Credentials:`);
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔒 Password: ${adminPassword}`);
      console.log(`\n🌐 You can now login at: http://localhost:8080/login`);
      console.log(`🛡️  Admin Panel: http://localhost:8080/admin`);
    }
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    connection.release();
  }
}

createAdminUser()
  .then(() => {
    console.log('\n✅ Admin creation process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to create admin user:', error);
    process.exit(1);
  });
