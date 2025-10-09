import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const createTables = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'simolyai',
  });

  try {
    console.log('🔄 Starting comprehensive database migration...');
    
    // Disable foreign key checks during migration
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Create app_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        site_name VARCHAR(255) NOT NULL DEFAULT 'SimplyAI',
        site_url TEXT NULL,
        logo TEXT NULL,
        primary_color VARCHAR(7) NOT NULL DEFAULT '#9b87f5',
        secondary_color VARCHAR(7) NOT NULL DEFAULT '#7E69AB',
        accent_color VARCHAR(7) NOT NULL DEFAULT '#E5DEFF',
        font_family VARCHAR(100) NOT NULL DEFAULT 'poppins',
        font_size VARCHAR(50) NOT NULL DEFAULT 'medium',
        button_style VARCHAR(50) NOT NULL DEFAULT 'rounded',
        dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        contact_email VARCHAR(255) NULL DEFAULT 'info@simolyai.com',
        enable_registration BOOLEAN NULL DEFAULT TRUE,
        favicon TEXT NULL,
        max_storage_per_user DECIMAL(10, 2) NULL DEFAULT 100.00,
        require_email_verification BOOLEAN NULL DEFAULT TRUE,
        site_description VARCHAR(500) NULL DEFAULT 'Piattaforma di analisi con AI',
        PRIMARY KEY (id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ app_settings table created');

    // Create form_field_types table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS form_field_types (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        icon VARCHAR(255) NULL,
        is_active BOOLEAN NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_type (type)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ form_field_types table created');

    // Create subscription_plans table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        price INT NOT NULL,
        \`interval\` VARCHAR(50) NOT NULL DEFAULT 'month',
        features JSON NOT NULL DEFAULT ('[]'),
        is_popular BOOLEAN NULL DEFAULT FALSE,
        button_text VARCHAR(255) NULL DEFAULT 'Inizia ora',
        button_variant VARCHAR(50) NULL DEFAULT 'outline',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        active BOOLEAN NULL DEFAULT TRUE,
        sort_order INT NULL DEFAULT 0,
        is_free BOOLEAN NULL DEFAULT FALSE,
        PRIMARY KEY (id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ subscription_plans table created');

    // Update profiles table structure
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id CHAR(36) NOT NULL,
        first_name VARCHAR(255) NULL,
        last_name VARCHAR(255) NULL,
        address TEXT NULL,
        fiscal_code VARCHAR(50) NULL,
        phone VARCHAR(20) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        subscription_plan VARCHAR(255) NULL,
        subscription_expiry TIMESTAMP NULL,
        role VARCHAR(50) NULL DEFAULT 'user',
        PRIMARY KEY (id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ profiles table created');

    // Create questionnaire_config table with updated structure
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS questionnaire_config (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        instructions TEXT NULL,
        questions JSON NOT NULL DEFAULT ('[]'),
        logo VARCHAR(500),
        version INT NOT NULL DEFAULT 1,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(255) NULL,
        theme JSON NULL,
        PRIMARY KEY (id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ questionnaire_config table created');

    // Create plan_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS plan_settings (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        plan_id CHAR(36) NULL,
        is_free BOOLEAN NULL DEFAULT FALSE,
        can_retake BOOLEAN NULL DEFAULT FALSE,
        retake_period_days INT NULL DEFAULT 90,
        retake_limit INT NULL DEFAULT 1,
        is_periodic BOOLEAN NULL DEFAULT FALSE,
        is_sequential BOOLEAN NULL DEFAULT FALSE,
        is_progress_tracking BOOLEAN NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ plan_settings table created');

    // Create plan_questionnaires table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS plan_questionnaires (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        plan_id CHAR(36) NULL,
        questionnaire_id CHAR(36) NULL,
        sequence_order INT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE,
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_config(id) ON DELETE CASCADE
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ plan_questionnaires table created');

    // Create prompt_templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        plan_id CHAR(36) NOT NULL,
        questionnaire_id CHAR(36) NOT NULL,
        sequence_index INT NOT NULL DEFAULT 0,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        variables JSON NOT NULL DEFAULT ('[]'),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        sections_data JSON NULL DEFAULT ('{"text": [], "charts": [], "tables": []}'),
        report_template TEXT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_config(id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ prompt_templates table created');

    // Create index for prompt_templates
    try {
      await connection.execute(`
        CREATE INDEX idx_prompt_templates_plan_questionnaire 
        ON prompt_templates (plan_id, questionnaire_id, sequence_index)
      `);
      console.log('✅ prompt_templates index created');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('ℹ️ prompt_templates index already exists');
      } else {
        console.error('❌ Error creating prompt_templates index:', error.message);
      }
    }

    // Create questionnaire_responses table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS questionnaire_responses (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        user_id CHAR(36) NOT NULL,
        answers JSON NOT NULL DEFAULT ('{}'),
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        version INT NULL DEFAULT 1,
        previous_version_id CHAR(36) NULL,
        questionnaire_id CHAR(36) NULL,
        completed_at TIMESTAMP NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (previous_version_id) REFERENCES questionnaire_responses(id),
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_config(id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ questionnaire_responses table created');

    // Create report_templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        content TEXT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        user_id CHAR(36) NOT NULL,
        is_default BOOLEAN NULL DEFAULT FALSE,
        PRIMARY KEY (id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ report_templates table created');

    // Create reports table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        user_id CHAR(36) NOT NULL,
        questionnaire_id CHAR(36) NULL,
        title VARCHAR(255) NOT NULL,
        content JSON NOT NULL,
        pdf_url TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        template_id CHAR(36) NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (questionnaire_id) REFERENCES questionnaire_responses(id),
        FOREIGN KEY (template_id) REFERENCES report_templates(id)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ reports table created');

    // Create user_subscriptions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        user_id CHAR(36) NOT NULL,
        plan_id CHAR(36) NOT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
        CHECK (status IN ('active', 'expired', 'canceled'))
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
    `);
    console.log('✅ user_subscriptions table created');

    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    // Insert default app settings (only if table is empty)
    const [settingsCount] = await connection.execute('SELECT COUNT(*) as count FROM app_settings');
    if (settingsCount[0].count === 0) {
      await connection.execute(`
        INSERT INTO app_settings (
          site_name, primary_color, secondary_color, accent_color,
          font_family, font_size, button_style, dark_mode,
          contact_email, enable_registration, max_storage_per_user,
          require_email_verification, site_description
        ) VALUES (
          'SimplyAI', '#9b87f5', '#7E69AB', '#E5DEFF',
          'poppins', 'medium', 'rounded', FALSE,
          'info@simolyai.com', TRUE, 100.00,
          TRUE, 'Piattaforma di analisi con AI'
        )
      `);
      console.log('✅ Default app settings inserted');
    } else {
      console.log('ℹ️ App settings already exist, skipping default insert');
    }

    console.log('🎉 All tables created successfully!');
    console.log('✅ Comprehensive migration completed successfully');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    await connection.end();
  }
};

createTables(); 