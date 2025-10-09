import express from 'express';
const router = express.Router();
import { pool } from '../db.js'; // Import the named export pool from db.js
import axios from 'axios'; // For making HTTP requests to the AI API

// Extract all unique reference questionnaire IDs from sections data

// Method to get reference questionnaires with questions and answers
const getReferenceQuestionnaires = async (reference_questionnaires, userId) => {
  try {
    if (!reference_questionnaires) {
      return [];
    }

    // Parse reference_questionnaires if it's a string
    const referenceData = typeof reference_questionnaires === 'string' 
      ? JSON.parse(reference_questionnaires) 
      : reference_questionnaires;

    if (!referenceData || !referenceData.referenceQuestionnairesResponses) {
      return [];
    }

    // Extract all unique questionnaire IDs
    const questionnaireIds = new Set();
    Object.values(referenceData.referenceQuestionnairesResponses).forEach(questionnaires => {
      if (Array.isArray(questionnaires)) {
        questionnaires.forEach(ref => {
          if (ref.questionnaireId) {
            questionnaireIds.add(ref.questionnaireId);
          }
        });
      }
    });

    if (questionnaireIds.size === 0) {
      return [];
    }

    const questionnaireIdsArray = Array.from(questionnaireIds);
    const placeholders = questionnaireIdsArray.map(() => '?').join(',');

    // Get questions from questionnaire_config table and answers from questionnaire_responses table
    const [results] = await pool.query(
      `SELECT 
        qc.id as questionnaire_id,
        qc.title as questionnaire_title,
        qc.questions,
        qr.responses as answers
       FROM questionnaire_config qc
       LEFT JOIN questionnaire_responses qr ON qc.id = qr.questionnaire_id AND qr.user_id = ?
       WHERE qc.id IN (${placeholders})
       ORDER BY qc.id`,
      [userId, ...questionnaireIdsArray]
    );

    return results.map(row => ({
      questionnaire_id: row.questionnaire_id,
      questionnaire_title: row.questionnaire_title,
      questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions,
      answers: row.answers ? (typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers) : null
    }));

  } catch (error) {
    console.error('Error in getReferenceQuestionnaires:', error);
    return [];
  }
};

// Fetch questionnaire responses for reference questionnaires

// Endpoint to generate a prompt and send it to the AI
router.post('/generate', async (req, res) => {
  try {
    const { questionnaireId, planId, responses, userId, title } = req.body;

    // Debugging log to confirm questionnaireId is received
    console.log('Received Questionnaire ID  ekaaaaa:', questionnaireId);

    if (!questionnaireId || !planId) {
      return res.status(400).json({ success: false, message: 'Questionnaire ID and Plan ID are required' });
    }

    // Fetch data from the database
    const [rows] = await pool.query(
      `SELECT system_prompt, content AS general_prompt, sections_data, report_template AS template_structure, reference_questionnaires
       FROM prompt_templates
       WHERE questionnaire_id = ? AND plan_id = ?`,
      [questionnaireId, planId]
    );

    // Debugging log to confirm database query result
    console.log('Database query result for questionnaireId ekaaaaaa:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No prompt data found for the given questionnaire and plan ID' });
    }

  const { system_prompt, general_prompt, sections_data, template_structure, reference_questionnaires } = rows[0];

    // Extract reference questionnaire IDs from sections data
    console.log('Reference Questionnaires from DBBBB:', reference_questionnaires);

    // Method to retrieve questions and answers for reference questionnaires
    const getQuestionsAndAnswers = async (referenceData, userId) => {
      try {
        if (!referenceData) {
          return [];
        }

        // Parse reference_questionnaires if it's a string
        const parsedData = typeof referenceData === 'string' 
          ? JSON.parse(referenceData) 
          : referenceData;

        console.log('Parsed reference data structure:', parsedData);

        if (!parsedData || Object.keys(parsedData).length === 0) {
          return [];
        }

        // Extract all unique questionnaire IDs and their associated shortcodes
        const questionnaireIds = new Set();
        const questionnaireShortcodes = {}; // Map questionnaire ID to shortcodes
        
        Object.values(parsedData).forEach(questionnaires => {
          if (Array.isArray(questionnaires)) {
            questionnaires.forEach(ref => {
              if (ref.questionnaireId) {
                questionnaireIds.add(ref.questionnaireId);
                
                // Store shortcode for this questionnaire ID
                if (!questionnaireShortcodes[ref.questionnaireId]) {
                  questionnaireShortcodes[ref.questionnaireId] = [];
                }
                questionnaireShortcodes[ref.questionnaireId].push({
                  shortcode: ref.shortcode,
                  sectionType: ref.sectionType
                });
              }
            });
          }
        });

        console.log('Questionnaire Shortcodes Mapping:', questionnaireShortcodes);

        if (questionnaireIds.size === 0) {
          return [];
        }

        console.log('Extracted Questionnaire IDs:', Array.from(questionnaireIds));

        const questionnaireIdsArray = Array.from(questionnaireIds);
        const placeholders = questionnaireIdsArray.map(() => '?').join(',');
        

        // Get questions from questionnaire_config table and answers from questionnaire_responses table
        const [results] = await pool.query(
          `SELECT 
            qc.id as questionnaire_id,
            qc.title as questionnaire_title,
            qc.questions,
            qr.answers as answers
           FROM new_schema.questionnaire_config qc
           LEFT JOIN new_schema.questionnaire_responses qr ON qc.id = qr.questionnaire_id AND qr.user_id = ?
           WHERE qc.id IN (${placeholders})
           ORDER BY qc.id`,
          [userId, ...questionnaireIdsArray]
        );

        return results.map(row => ({
          questionnaire_id: row.questionnaire_id,
          questionnaire_title: row.questionnaire_title,
          questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions,
          answers: row.answers ? (typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers) : null,
          shortcodes: questionnaireShortcodes[row.questionnaire_id] || [] // Include associated shortcodes
        }));

      } catch (error) {
        console.error('Error in getQuestionsAndAnswers:', error);
        return [];
      }
    };
console.log('User ID ekaaaaaaa:', userId);
console.log('Reference Questionnaires ekaaaaaaa:', reference_questionnaires);
    // Call the method to get questions and answers
    const questionsAndAnswersData = await getQuestionsAndAnswers(reference_questionnaires, userId);
    console.log('Retrieved Questions and Answers Data:', JSON.stringify(questionsAndAnswersData, null, 2));

    

    // Construct the hardcoded prompt
    const hard_coded_prompt = `
      In here the questionnaire and relevant responses for that answers are attached. Please refer to them and create sections for the report. 
      There are 3 types of sections in the report: text, graph, and table. Generate all the sections and give the response as a JSON file. 
      In that JSON response, shortcode must be included for each section (text, graph, table).

      IMPORTANT: Use the Reference Questionnaires Responses data to generate content for sections that have matching shortcodes. For each section, check if its shortcode matches any shortcode in the Reference Questionnaires Responses data, and if so, incorporate that questionnaire's questions and answers into the section content.

      Example JSON template:
      {
  "sections": [
    {
      "section_type": "text",
      "id": "text1",
      "shortcode": "summary",
      "title": "Summary of Responses",
      "content": "This is the summary of the responses."
    },
    {
      "section_type": "graph",
      "id": "graph1",
      "shortcode": "response_distribution",
      "title": "Response Distribution",
      "type": "bar",
      "data": {
        "labels": ["Option 1", "Option 2"],
        "values": [10, 20]
      }
    },
    {
      "section_type": "table",
      "id": "table1",
      "shortcode": "detailed_responses",
      "title": "Detailed Responses",
      "headers": ["Question", "Answer"],
      "rows": [
        ["Question 1", "Answer 1"],
        ["Question 2", "Answer 2"]
      ]
    }
  ]
}

    `;

    // Construct the final prompt
    const finalPrompt = `
      System Prompt: ${system_prompt}
      General Prompt: ${general_prompt}
      Template Structure: ${template_structure}
      Sections Data: ${JSON.stringify(sections_data)}
      Reference Questionnaires Responses: ${JSON.stringify(questionsAndAnswersData)}
      Current Questionnaire Responses: ${JSON.stringify(responses)}
      Hardcoded Prompt: ${hard_coded_prompt}
    `;

    console.log('Generated Prompt:', finalPrompt);

    // Send the prompt to the AI
    const aiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
  model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: finalPrompt
        }
      ],
      max_tokens: 5000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    // Log the AI response in the backend
    console.log('AI Responseeeeeeee:', JSON.stringify(aiResponse.data, null, 2));

    // Extract the content section from the AI response
    const aiContent = aiResponse.data.choices[0].message.content;
    console.log('Extracted AI Content:', aiContent);

    // Insert the new report into the reports table
    const [result] = await pool.query(
      `INSERT INTO reports (user_id, questionnaire_response_id, questionnaire_id, title, content, pdf_url, created_at, template_id, ai_response)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        userId, // user_id
        null, // questionnaire_response_id (set to null if not available)
        questionnaireId, // questionnaire_id
        title || 'Generated Report', // title
         JSON.stringify([{ value: "Test value" }]),// content (set to null if not available)
        null, // pdf_url (set to null if not available)
        null, // template_id (set to null if not available)
        aiContent // ai_response
      ]
    );

    // Get the ID of the newly inserted report
    const newReportId = result.insertId;
    console.log('New Report ID:', newReportId);

    res.json({ success: true, reportId: newReportId, aiResponse: aiResponse.data });
  } catch (error) {
    console.error('Error in AI integration:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
