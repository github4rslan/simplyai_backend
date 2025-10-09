import { pool } from '../db.js';

async function addSubscriptionIdColumn() {
  try {
    console.log('Adding subscription_id column to questionnaire_responses table...');
    
    // Check if column already exists
    const [columns] = await pool.query(`
      SHOW COLUMNS FROM questionnaire_responses LIKE 'subscription_id'
    `);
    
    if (columns.length > 0) {
      console.log('✅ subscription_id column already exists');
      return;
    }
    
    // Add the subscription_id column
    await pool.query(`
      ALTER TABLE questionnaire_responses 
      ADD COLUMN subscription_id CHAR(36) AFTER user_id
    `);
    
    // Add index for performance
    await pool.query(`
      ALTER TABLE questionnaire_responses 
      ADD INDEX idx_subscription_responses (subscription_id)
    `);
    
    console.log('✅ Successfully added subscription_id column and index');
    
    // Optional: Update existing records with subscription_id (match by user_id and plan_id)
    console.log('Updating existing records with subscription_id...');
    const [updateResult] = await pool.query(`
      UPDATE questionnaire_responses qr
      JOIN user_subscriptions us ON qr.user_id = us.user_id AND qr.plan_id = us.plan_id
      SET qr.subscription_id = us.id
      WHERE qr.subscription_id IS NULL
    `);
    
    console.log(`✅ Updated ${updateResult.affectedRows} existing records`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
addSubscriptionIdColumn()
  .then(() => {
    console.log('🎉 Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
