import { pool } from './db.js';

async function addPaymentColumns() {
  try {
    console.log('🚀 Starting payment settings migration...');
    
    const connection = await pool.getConnection();
    
    // Check current columns
    const [columns] = await connection.execute('DESCRIBE app_settings');
    const existingColumns = columns.map(col => col.Field);
    
    console.log('📋 Current columns:', existingColumns.length);
    
    // Add payment-related columns if they don't exist
    const columnsToAdd = [
      'enable_payments BOOLEAN DEFAULT TRUE',
      'currency VARCHAR(3) DEFAULT "EUR"',
      'vat_percentage DECIMAL(5,2) DEFAULT 22.00',
      'stripe_public_key TEXT NULL',
      'stripe_secret_key TEXT NULL'
    ];
    
    for (const columnDef of columnsToAdd) {
      const columnName = columnDef.split(' ')[0];
      if (!existingColumns.includes(columnName)) {
        console.log(`➕ Adding column: ${columnName}`);
        await connection.execute(`ALTER TABLE app_settings ADD COLUMN ${columnDef}`);
        console.log(`✅ Added ${columnName}`);
      } else {
        console.log(`ℹ️ Column ${columnName} already exists`);
      }
    }
    
    // Update existing records with defaults
    console.log('🔄 Setting default values...');
    await connection.execute(`
      UPDATE app_settings 
      SET 
        enable_payments = COALESCE(enable_payments, TRUE),
        currency = COALESCE(currency, 'EUR'),
        vat_percentage = COALESCE(vat_percentage, 22.00)
      WHERE enable_payments IS NULL OR currency IS NULL OR vat_percentage IS NULL
    `);
    
    console.log('🎉 Migration completed successfully!');
    
    // Show final structure
    const [finalColumns] = await connection.execute('DESCRIBE app_settings');
    console.log('\n📊 Payment-related columns:');
    finalColumns.forEach(col => {
      if (['enable_payments', 'currency', 'vat_percentage', 'stripe_public_key', 'stripe_secret_key'].includes(col.Field)) {
        console.log(`  ✓ ${col.Field}: ${col.Type}`);
      }
    });
    
    connection.release();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addPaymentColumns();
