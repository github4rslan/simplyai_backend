import { pool } from '../db.js';

/**
 * Migration to add payment-related columns to app_settings table
 * This enables currency, VAT, and Stripe configuration from the admin panel
 */
async function addPaymentSettingsColumns() {
  try {
    console.log('🚀 Starting payment settings migration...');
    
    const connection = await pool.getConnection();
    
    // Check if columns already exist
    const [columns] = await connection.execute('DESCRIBE app_settings');
    const existingColumns = columns.map(col => col.Field);
    
    console.log('📋 Current app_settings columns:', existingColumns);
    
    // Add payment-related columns if they don't exist
    const columnsToAdd = [
      {
        name: 'enable_payments',
        definition: 'BOOLEAN DEFAULT TRUE COMMENT "Enable or disable payment system"'
      },
      {
        name: 'currency',
        definition: 'VARCHAR(3) DEFAULT "EUR" COMMENT "Payment currency (EUR, USD, etc.)"'
      },
      {
        name: 'vat_percentage',
        definition: 'DECIMAL(5,2) DEFAULT 22.00 COMMENT "VAT percentage for invoices"'
      },
      {
        name: 'stripe_public_key',
        definition: 'TEXT NULL COMMENT "Stripe publishable key for frontend"'
      },
      {
        name: 'stripe_secret_key',
        definition: 'TEXT NULL COMMENT "Stripe secret key for backend (encrypted)"'
      }
    ];
    
    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        console.log(`➕ Adding column: ${column.name}`);
        await connection.execute(`ALTER TABLE app_settings ADD COLUMN ${column.name} ${column.definition}`);
        console.log(`✅ Added ${column.name} column`);
      } else {
        console.log(`ℹ️ Column ${column.name} already exists, skipping`);
      }
    }
    
    // Check if we have any app_settings records, if not create default
    const [settingsCount] = await connection.execute('SELECT COUNT(*) as count FROM app_settings');
    
    if (settingsCount[0].count === 0) {
      console.log('📝 No app_settings found, creating default record...');
      await connection.execute(`
        INSERT INTO app_settings (
          site_name, site_description, contact_email, 
          primary_color, secondary_color, accent_color,
          font_family, font_size, button_style,
          enable_registration, require_email_verification, max_storage_per_user,
          enable_payments, currency, vat_percentage
        ) VALUES (
          'Simoly AI', 'Piattaforma di analisi con AI', 'info@simolyai.com',
          '#9b87f5', '#7E69AB', '#E5DEFF',
          'poppins', 'medium', 'rounded',
          TRUE, TRUE, 100.00,
          TRUE, 'EUR', 22.00
        )
      `);
      console.log('✅ Default app_settings record created');
    } else {
      // Update existing records to have default payment values if they're NULL
      console.log('🔄 Updating existing app_settings with payment defaults...');
      await connection.execute(`
        UPDATE app_settings 
        SET 
          enable_payments = COALESCE(enable_payments, TRUE),
          currency = COALESCE(currency, 'EUR'),
          vat_percentage = COALESCE(vat_percentage, 22.00)
        WHERE enable_payments IS NULL OR currency IS NULL OR vat_percentage IS NULL
      `);
      console.log('✅ Updated existing records with payment defaults');
    }
    
    // Verify the final structure
    const [finalColumns] = await connection.execute('DESCRIBE app_settings');
    console.log('\n📊 Final app_settings table structure:');
    finalColumns.forEach(col => {
      if (col.Field.includes('payment') || col.Field.includes('currency') || col.Field.includes('vat') || col.Field.includes('stripe')) {
        console.log(`  ✓ ${col.Field}: ${col.Type} ${col.Null === 'NO' ? '(NOT NULL)' : '(NULLABLE)'} ${col.Default ? `(Default: ${col.Default})` : ''}`);
      }
    });
    
    connection.release();
    console.log('🎉 Payment settings migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
if (import.meta.url === `file://${process.argv[1]}`) {
  addPaymentSettingsColumns()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { addPaymentSettingsColumns };
