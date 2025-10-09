import express from 'express';
import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all prompt templates for a specific plan
router.get('/plan/:planId', async (req, res) => {
  try {
    const { planId } = req.params;

    // Fetch all prompt templates for the given plan ID
    const [promptTemplateRows] = await pool.query(`
      SELECT * FROM prompt_templates 
      WHERE plan_id = ? 
      ORDER BY sequence_index ASC
    `, [planId]);

    res.json({
      success: true,
      data: promptTemplateRows
    });
  } catch (error) {
    console.error('Error fetching prompt templates for plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prompt templates'
    });
  }
});

// Get prompt templates for a specific plan and questionnaire
router.get('/plan/:planId/questionnaire/:questionnaireId', async (req, res) => {
  try {
    const { planId, questionnaireId } = req.params;

    // Fetch prompt templates for the given plan ID and questionnaire ID
    const [rows] = await pool.query(`
      SELECT * FROM prompt_templates 
      WHERE plan_id = ? AND questionnaire_id = ?
      ORDER BY sequence_index ASC
    `, [planId, questionnaireId]);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching prompt templates for plan and questionnaire:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prompt templates'
    });
  }
});

// Get specific prompt template by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch a specific prompt template by ID
    const [rows] = await pool.query(`
      SELECT * FROM prompt_templates WHERE id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Prompt template not found'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error fetching prompt template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prompt template'
    });
  }
});

// Create new prompt template
router.post('/', async (req, res) => {
  try {
    const {
      plan_id,
      questionnaire_id,
      title,
      content,
      prompt_principale,
      system_prompt,
      variables,
      sequence_index,
      sections_data,
      report_template,
      reportTemplate,
      template_structure,
      reference_questionnaires
    } = req.body;

    console.log('📥 POST - Received data:', {
      plan_id,
      questionnaire_id,
      title,
      content: content?.substring(0, 50) + '...',
      prompt_principale: prompt_principale?.substring(0, 50) + '...',
      system_prompt: system_prompt?.substring(0, 50) + '...',
      report_template: report_template?.substring(0, 50) + '...',
      reportTemplate: reportTemplate?.substring(0, 50) + '...',
      template_structure: template_structure?.substring(0, 50) + '...',
      reference_questionnaires: reference_questionnaires ? Object.keys(reference_questionnaires).length + ' references' : 'none'
    });

    // Validate required fields
    if (!plan_id || !questionnaire_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and questionnaire ID are required'
      });
    }

    // Prepare the final values with proper priority
    const finalSystemPrompt = system_prompt || 'Sei un assistente esperto che analizza i dati dei questionari.';
    const finalPromptPrincipale = content || prompt_principale || '';
    const finalTemplateStructure = template_structure || reportTemplate || report_template || '';
    const sectionsData = sections_data || {};
    const referenceQuestionnaires = reference_questionnaires || {};

    console.log('🔧 Final values to save:', {
      finalSystemPrompt: finalSystemPrompt?.substring(0, 50) + '...',
      finalPromptPrincipale: finalPromptPrincipale?.substring(0, 50) + '...',
      finalTemplateStructure: finalTemplateStructure?.substring(0, 50) + '...',
      referenceQuestionnaires: Object.keys(referenceQuestionnaires).length + ' references'
    });

    // Check if record already exists for this plan/questionnaire combination
    const [existingRows] = await pool.query(`
      SELECT id FROM prompt_templates 
      WHERE plan_id = ? AND questionnaire_id = ?
    `, [plan_id, questionnaire_id]);

    if (existingRows.length > 0) {
      // Update existing record
      const updateQuery = `
        UPDATE prompt_templates SET 
          title = ?, 
          content = ?, 
          system_prompt = ?, 
          variables = ?, 
          sequence_index = ?, 
          sections_data = ?, 
          report_template = ?, 
          reference_questionnaires = ?,
          updated_at = NOW()
        WHERE id = ?
      `;

      await pool.execute(updateQuery, [
        title,
        finalPromptPrincipale,
        finalSystemPrompt,
        JSON.stringify(variables || []),
        sequence_index || 0,
        JSON.stringify(sectionsData),
        finalTemplateStructure,
        JSON.stringify(referenceQuestionnaires),
        existingRows[0].id
      ]);

      console.log('✅ Updated existing record for plan:', plan_id, 'questionnaire:', questionnaire_id);

      res.json({
        success: true,
        message: 'Prompt template updated successfully',
        data: { id: existingRows[0].id }
      });
    } else {
      // Create new record with UUID
      const newId = uuidv4();
      const insertQuery = `
        INSERT INTO prompt_templates (
          id, plan_id, questionnaire_id, title, content, system_prompt, 
          variables, sequence_index, sections_data, report_template, reference_questionnaires, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      await pool.execute(insertQuery, [
        newId,
        plan_id,
        questionnaire_id,
        title,
        finalPromptPrincipale,
        finalSystemPrompt,
        JSON.stringify(variables || []),
        sequence_index || 0,
        JSON.stringify(sectionsData),
        finalTemplateStructure,
        JSON.stringify(referenceQuestionnaires)
      ]);

      console.log('✅ Created new record with ID:', newId);

      res.json({
        success: true,
        message: 'Prompt template created successfully',
        data: { id: newId }
      });
    }
  } catch (error) {
    console.error('❌ Error creating/updating prompt template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save prompt template',
      error: error.message
    });
  }
});

// Update prompt template
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      prompt_principale,
      system_prompt,
      variables,
      sequence_index,
      sections_data,
      report_template,
      reportTemplate,
      template_structure,
      reference_questionnaires
    } = req.body;

    console.log('📥 PUT - Received data for ID:', id, {
      content: content?.substring(0, 50) + '...',
      prompt_principale: prompt_principale?.substring(0, 50) + '...',
      system_prompt: system_prompt?.substring(0, 50) + '...',
      template_structure: template_structure?.substring(0, 50) + '...',
      reportTemplate: reportTemplate?.substring(0, 50) + '...',
      reference_questionnaires: reference_questionnaires ? Object.keys(reference_questionnaires).length + ' references' : 'none'
    });

    // Prepare the final values with proper priority
    const finalSystemPrompt = system_prompt || 'Sei un assistente esperto che analizza i dati dei questionari.';
    const finalPromptPrincipale = content || prompt_principale || '';
    const finalTemplateStructure = template_structure || reportTemplate || report_template || '';
    const sectionsData = sections_data || {};
    const referenceQuestionnaires = reference_questionnaires || {};

    // Update in prompt_templates table
    const updateQuery = `
      UPDATE prompt_templates SET 
        title = ?, 
        content = ?, 
        system_prompt = ?, 
        variables = ?, 
        sequence_index = ?, 
        sections_data = ?, 
        report_template = ?, 
        reference_questionnaires = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    const [result] = await pool.execute(updateQuery, [
      title,
      finalPromptPrincipale,
      finalSystemPrompt,
      JSON.stringify(variables || []),
      sequence_index || 0,
      JSON.stringify(sectionsData),
      finalTemplateStructure,
      JSON.stringify(referenceQuestionnaires),
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Prompt template not found'
      });
    }

    console.log('✅ Updated in prompt_templates table for ID:', id);

    res.json({
      success: true,
      message: 'Prompt template updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating prompt template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prompt template',
      error: error.message
    });
  }
});

// Delete prompt template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete from prompt_templates
    const [result] = await pool.query('DELETE FROM prompt_templates WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Prompt template not found'
      });
    }

    res.json({
      success: true,
      message: 'Prompt template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting prompt template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete prompt template'
    });
  }
});

// Get report_template for a specific questionnaire_id
router.get('/template/:questionnaireId', async (req, res) => {
  try {
    const { questionnaireId } = req.params;

    // Fetch the report_template for the given questionnaire_id
    const [rows] = await pool.query(
      `SELECT report_template FROM prompt_templates WHERE questionnaire_id = ?`,
      [questionnaireId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    res.json({
      success: true,
      reportTemplate: rows[0].report_template
    });
  } catch (error) {
    console.error('Error fetching report template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report template'
    });
  }
});

export default router;