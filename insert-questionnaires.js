import { pool } from './db.js';

async function insertSampleQuestionnaires() {
  try {
    const questionnaires = [
      {
        id: 'q1',
        title: 'Valutazione Aziendale',
        description: 'Questionario per valutare le performance aziendali',
        status: 'published'
      },
      {
        id: 'q2', 
        title: 'Analisi Bisogni Formativi',
        description: 'Questionario per identificare i bisogni formativi',
        status: 'published'
      },
      {
        id: 'q3',
        title: 'Soddisfazione Cliente', 
        description: 'Questionario per misurare la soddisfazione del cliente',
        status: 'published'
      },
      {
        id: 'q4',
        title: 'Leadership Assessment',
        description: 'Questionario per valutare le competenze di leadership', 
        status: 'published'
      },
      {
        id: 'q5',
        title: 'Valutazione Competenze Digitali',
        description: 'Questionario per valutare le competenze digitali',
        status: 'published'
      }
    ];

    for (const questionnaire of questionnaires) {
      try {
        await pool.query(`
          INSERT INTO questionnaire_config (id, title, description, status)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)
        `, [questionnaire.id, questionnaire.title, questionnaire.description, questionnaire.status]);
        
        console.log(`Inserted questionnaire: ${questionnaire.title}`);
      } catch (error) {
        console.error(`Error inserting questionnaire ${questionnaire.title}:`, error);
      }
    }

    console.log('Sample questionnaires inserted successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error inserting sample questionnaires:', error);
    process.exit(1);
  }
}

insertSampleQuestionnaires();
