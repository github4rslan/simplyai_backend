import express from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

const router = express.Router();

const parseJson = (value, fallback = null) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
};

const buildSectionRequirements = (sectionsData = {}) => {
  const parts = [];

  if (Array.isArray(sectionsData.text)) {
    parts.push("TEXT SECTIONS:");
    sectionsData.text.forEach((section) => {
      parts.push(
        `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}"${section.prompt ? `, Instructions: "${section.prompt}"` : ""}`
      );
    });
  }

  if (Array.isArray(sectionsData.charts)) {
    parts.push("", "CHART SECTIONS:");
    sectionsData.charts.forEach((section) => {
      parts.push(
        `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"${section.prompt ? `, Instructions: "${section.prompt}"` : ""}`
      );
    });
  }

  if (Array.isArray(sectionsData.tables)) {
    parts.push("", "TABLE SECTIONS:");
    sectionsData.tables.forEach((section) => {
      parts.push(
        `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"${section.prompt ? `, Instructions: "${section.prompt}"` : ""}`
      );
    });
  }

  return parts.join("\n");
};

const fetchQuestionnaireData = async (questionnaireId) => {
  const [rows] = await pool.query(
    `SELECT id, title, description, questions FROM questionnaire_config WHERE id = ?`,
    [questionnaireId]
  );

  if (rows.length === 0) {
    return {
      id: questionnaireId,
      title: "Untitled Questionnaire",
      description: "",
      questions: null,
    };
  }

  const record = rows[0];
  return {
    id: record.id,
    title: record.title || "Untitled Questionnaire",
    description: record.description || "",
    questions: record.questions ? parseJson(record.questions, record.questions) : null,
  };
};

const fetchReferenceQuestionnaires = async (referenceQuestionnaires = {}) => {
  const data = {};

  const uniqueIds = new Set();
  for (const refs of Object.values(referenceQuestionnaires)) {
    if (Array.isArray(refs)) {
      refs.forEach((ref) => ref?.questionnaireId && uniqueIds.add(ref.questionnaireId));
    }
  }

  for (const questionnaireId of uniqueIds) {
    const [rows] = await pool.query(
      `SELECT id, title, description, questions FROM questionnaire_config WHERE id = ?`,
      [questionnaireId]
    );

    if (rows.length > 0) {
      data[questionnaireId] = {
        id: questionnaireId,
        title: rows[0].title || "Untitled",
        description: rows[0].description || "",
        questions: rows[0].questions
          ? parseJson(rows[0].questions, rows[0].questions)
          : null,
      };
    }
  }

  return data;
};

const generateAiPreview = async (systemPrompt, mainPrompt, sectionsData) => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const sectionRequirements = buildSectionRequirements(sectionsData);
  const sampleResponses = { sample: "Preview dataset" };

  const finalPrompt = `You are an expert report generation AI assistant. Create a professional, comprehensive report in JSON format.

CONTEXT AND INSTRUCTIONS:
${systemPrompt}
${mainPrompt ? `\nAdditional Guidelines: ${mainPrompt}` : ""}

USER INPUT DATA (SAMPLE):
${JSON.stringify(sampleResponses, null, 2)}

REQUIRED SECTIONS TO GENERATE:
${sectionRequirements}

OUTPUT FORMAT:
{
  "sections": [
    {
      "section_type": "text",
      "id": "1",
      "shortcode": "intro",
      "title": "Introduction",
      "content": "..."
    }
  ]
}

Generate the report now:`;

  try {
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional report generation AI. You MUST respond with ONLY valid JSON.",
          },
          {
            role: "user",
            content: finalPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let aiContent = aiResponse.data.choices[0].message.content.trim();
    aiContent = aiContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    return parseJson(aiContent, null);
  } catch (error) {
    console.error("AI preview generation failed:", error.message);
    return null;
  }
};

const buildAiResponseData = (
  mainQuestionnaire,
  referenceQuestionnairesData,
  parsedSectionsData,
  referenceQuestionnaires,
  systemPrompt,
  mainPrompt,
  generatedAIResponse
) => ({
  metadata: {
    generated_at: new Date().toISOString(),
    version: "1.0",
  },
  prompt_structure: {
    system_prompt: systemPrompt,
    main_prompt: mainPrompt,
    sections_data: parsedSectionsData,
    reference_questionnaires: referenceQuestionnaires,
  },
  main_questionnaire: mainQuestionnaire,
  reference_questionnaires_data: referenceQuestionnairesData,
  ai_generated_response: generatedAIResponse,
});

router.get("/plan/:planId", async (req, res) => {
  try {
    const { planId } = req.params;
    const [promptTemplateRows] = await pool.query(
      `SELECT * FROM prompt_templates WHERE plan_id = ? ORDER BY sequence_index ASC`,
      [planId]
    );

    res.json({ success: true, data: promptTemplateRows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch prompt templates" });
  }
});

router.get("/plan/:planId/questionnaire/:questionnaireId", async (req, res) => {
  try {
    const { planId, questionnaireId } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM prompt_templates WHERE plan_id = ? AND questionnaire_id = ? ORDER BY sequence_index ASC`,
      [planId, questionnaireId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch prompt templates" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`SELECT * FROM prompt_templates WHERE id = ?`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Prompt template not found" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch prompt template" });
  }
});

router.post("/", async (req, res) => {
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
      reference_questionnaires,
    } = req.body;

    if (!plan_id || !questionnaire_id) {
      return res.status(400).json({ success: false, message: "Plan ID and questionnaire ID are required" });
    }

    const finalSystemPrompt =
      system_prompt || "Sei un assistente esperto che analizza i dati dei questionari.";
    const finalPromptPrincipale = content || prompt_principale || "";
    const finalTemplateStructure = template_structure || reportTemplate || report_template || "";
    const sectionsData = sections_data || {};
    const referenceQuestionnaires = reference_questionnaires || {};

    const mainQuestionnaire = await fetchQuestionnaireData(questionnaire_id);
    const referenceQuestionnairesData = await fetchReferenceQuestionnaires(referenceQuestionnaires);
    const parsedSectionsData = parseJson(sectionsData, {});

    const generatedAIResponse = await generateAiPreview(
      finalSystemPrompt,
      finalPromptPrincipale,
      parsedSectionsData
    );

    const completeAIResponseData = buildAiResponseData(
      mainQuestionnaire,
      referenceQuestionnairesData,
      parsedSectionsData,
      referenceQuestionnaires,
      finalSystemPrompt,
      finalPromptPrincipale,
      generatedAIResponse
    );

    const [existingRows] = await pool.query(
      `SELECT id FROM prompt_templates WHERE plan_id = ? AND questionnaire_id = ?`,
      [plan_id, questionnaire_id]
    );

    if (existingRows.length > 0) {
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
          ai_response = ?,
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
        JSON.stringify(completeAIResponseData),
        existingRows[0].id,
      ]);

      return res.json({
        success: true,
        message: "Prompt template updated successfully",
        data: { id: existingRows[0].id, ai_response: completeAIResponseData },
      });
    }

    const newId = uuidv4();
    const insertQuery = `
      INSERT INTO prompt_templates (
        id, plan_id, questionnaire_id, title, content, system_prompt, 
        variables, sequence_index, sections_data, report_template, 
        reference_questionnaires, ai_response, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
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
      JSON.stringify(referenceQuestionnaires),
      JSON.stringify(completeAIResponseData),
    ]);

    res.json({
      success: true,
      message: "Prompt template created successfully",
      data: { id: newId, ai_response: completeAIResponseData },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to save prompt template",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
      reference_questionnaires,
    } = req.body;

    let planId = plan_id;
    let questionnaireId = questionnaire_id;

    if (!planId || !questionnaireId) {
      const [existingTemplate] = await pool.query(
        `SELECT plan_id, questionnaire_id FROM prompt_templates WHERE id = ?`,
        [id]
      );

      if (existingTemplate.length === 0) {
        return res.status(404).json({ success: false, message: "Prompt template not found" });
      }

      planId = planId || existingTemplate[0].plan_id;
      questionnaireId = questionnaireId || existingTemplate[0].questionnaire_id;
    }

    const finalSystemPrompt =
      system_prompt || "Sei un assistente esperto che analizza i dati dei questionari.";
    const finalPromptPrincipale = content || prompt_principale || "";
    const finalTemplateStructure = template_structure || reportTemplate || report_template || "";
    const sectionsData = sections_data || {};
    const referenceQuestionnaires = reference_questionnaires || {};

    const mainQuestionnaire = await fetchQuestionnaireData(questionnaireId);
    const referenceQuestionnairesData = await fetchReferenceQuestionnaires(referenceQuestionnaires);
    const parsedSectionsData = parseJson(sectionsData, {});

    const generatedAIResponse = await generateAiPreview(
      finalSystemPrompt,
      finalPromptPrincipale,
      parsedSectionsData
    );

    const completeAIResponseData = buildAiResponseData(
      mainQuestionnaire,
      referenceQuestionnairesData,
      parsedSectionsData,
      referenceQuestionnaires,
      finalSystemPrompt,
      finalPromptPrincipale,
      generatedAIResponse
    );

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
        ai_response = ?,
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
      JSON.stringify(completeAIResponseData),
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Prompt template not found" });
    }

    res.json({
      success: true,
      message: "Prompt template updated successfully with new AI response",
      data: { id, ai_response: completeAIResponseData },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update prompt template",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query("DELETE FROM prompt_templates WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Prompt template not found" });
    }

    res.json({ success: true, message: "Prompt template deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete prompt template" });
  }
});

router.get("/template/:questionnaireId", async (req, res) => {
  try {
    const { questionnaireId } = req.params;
    const [rows] = await pool.query(
      `SELECT report_template FROM prompt_templates WHERE questionnaire_id = ?`,
      [questionnaireId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Report template not found" });
    }

    res.json({ success: true, reportTemplate: rows[0].report_template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch report template" });
  }
});

export default router;
